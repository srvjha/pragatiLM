# Data flow: a YouTube link, end to end

One worked example, followed layer by layer with the file that owns each step.
Someone pastes `https://www.youtube.com/watch?v=dQw4w9WgXcQ` into a notebook and
later asks a question about it. Everything below is what actually happens, in
order, with the file path and the reason the step exists where it does.

Read [ARCHITECTURE.md](./ARCHITECTURE.md) first if you want the shape of the
system; this document is the trace through it.

---

## The one-screen version

```
BROWSER                          API PROCESS                    WORKER PROCESS         STORES
add-source-dialog.tsx
   |
   | useAddYoutubeSource
   v
features/sources/api.ts
   | POST /api/notebooks/:id/sources/youtube  { url }
   |------------------------------> app.ts
   |                                  -> notebook.route.ts  (session, notebook, rate limit)
   |                                  -> source.route.ts    (zod body)
   |                                  -> source.controller.ts
   |                                  -> source.service.ts
   |                                       parse url, SSRF check, hash, dedupe
   |                                       INSERT sources row (QUEUED) ------------------> Postgres
   |                                       enqueueIngest ------------------> Redis (BullMQ)
   |<-- 201 { SourceDto }  (< 500ms, nothing fetched yet)
   |
   | EventSource GET .../sources/events
   |------------------------------> sse.ts  subscribes  source:<notebookId>
                                                            |
                                            ingest.worker.ts picks the job up
                                                            |
                                            ingestion/pipeline.ts
                                              EXTRACTING -> youtube.extractor.ts
                                                              youtubei.js  (metadata + track list)
                                                              yt-dlp       (timed cues)   <- preferred
                                                              langchain    (plain text)   <- fallback
                                                              info.getTranscript()        <- last resort
                                              rename source, merge metadata --------------> Postgres
                                              CHUNKING  -> timed.chunker.ts (60-90s spans)
                                              (Devanagari? -> captions.service.ts translate)
                                              EMBEDDING -> chunk rows ---------------------> Postgres
                                                        -> openai.provider.ts embeddings
                                                        -> chunk.vector-repository.ts -----> Qdrant
                                              READY
   |<-- SSE frames at every status change --  status.service.ts publishes to Redis pub/sub
   v
use-source-events.ts patches the TanStack Query cache -> the row turns green
```

---

## Part 1 — Ingestion

### Layer 1. The dialog (browser)

**`client/src/components/sources/add-source-dialog.tsx`**

The "YT Link" tile renders `UrlPane` with `kind="youtube"` (line 133). The pane
holds one controlled input and calls `mutation.mutate(url.trim())` on submit or
Enter (line 395). No URL validation happens here on purpose — the server is the
only thing that can decide whether a URL is a real, safe, non-duplicate video,
and validating in two places means two answers.

The dialog is mounted by `client/src/components/sources/source-list.tsx:114`.

### Layer 2. The mutation (browser)

**`client/src/features/sources/hooks.ts:93`** — `useAddYoutubeSource` wraps
`useSourceMutation`, which on settle invalidates
`queryKeys.sources.list(notebookId)` and the notebook list, so the new row
appears without a reload.

**`client/src/features/sources/api.ts:30`** — `addYoutubeSource` posts
`{ url }` as JSON.

**`client/src/lib/api-client.ts:30`** — `apiFetch` is the only place that knows
the base URL and the `{ data } | { error }` envelope. It sets
`credentials: "include"` (line 42) because the session cookie belongs to the
API's origin, and unwraps `body.data` or throws `ApiError`.

Wire format out:

```http
POST /api/notebooks/6f0e.../sources/youtube
Content-Type: application/json
Cookie: better-auth.session_token=...

{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
```

### Layer 3. App middleware (API process)

**`server/src/app.ts`** — helmet, CORS pinned to `WEB_ORIGIN` with credentials
(line 22), compression that explicitly skips `text/event-stream` (line 29, or
the SSE stream would be buffered and deliver nothing), `pino-http` with a
per-request id (line 41) that later ends up in the worker's logs, then
`express.json({ limit: "1mb" })`.

### Layer 4. Routing and guards (API process)

**`server/src/routes/notebook.route.ts`**

| Line | What runs | Failure |
|------|-----------|---------|
| 24 | `requireSession` for everything under `/notebooks` | 401 |
| 31–35 | `validate({ params: notebookIdParams })` then `resolveNotebook` | 400 / 404 |
| 37 | `ingestLimiter` (60 req/min), then `sourceRouter` | 429 |

**`server/src/middleware/session.ts:21`** — Better Auth resolves the cookie into
`req.user`. This is the authentication boundary; the client hiding signed-out UI
is presentation only.

**`server/src/middleware/ownership.ts:23`** — `resolveNotebook` loads the
notebook once and hangs it on `req.notebook`. A notebook owned by someone else
is a **404, not a 403**, because a 403 confirms the id is real.

**`server/src/routes/source.route.ts:54`** — the route itself:
`validate({ body: createYoutubeBody })` → `controller.createYoutube`. The
schema (`server/src/schemas/source.schema.ts:14`) only asserts a non-empty
trimmed string; what counts as a YouTube URL is decided in the service.

### Layer 5. Controller (API process)

**`server/src/controllers/source.controller.ts:105`** — nine lines. It reads
the validated body, calls the service, replies `201 { data }`, forwards errors
to `next`. Controllers hold no logic worth testing on their own.

### Layer 6. Service — the part that decides (API process)

**`server/src/services/source.service.ts:171`** — `addYoutube`:

1. **`parseYoutubeUrl(rawUrl)`** (`server/src/lib/youtube.ts:23`) — checks the
   host against a fixed set, then pulls a `videoId` (11 chars) or a `playlistId`
   out of `?v=`, `youtu.be/<id>`, `/shorts/`, `/embed/`, `/live/` or `?list=`.
   A watch URL inside a playlist resolves to the **video**, because that is what
   the person clicked. Anything else is a 400 with a readable message.
2. **`assertSafeUrl(rawUrl)`** (`server/src/lib/url-safety.ts:61`) — NFR-10.
   The server is about to fetch a user-supplied URL, so the hostname is resolved
   and **every** returned address is checked against private, loopback,
   link-local, CGNAT and cloud-metadata ranges. All of them, not just the first,
   because a name can resolve to both a public and a private address.
3. **`hashUrl(url)`** (`server/src/lib/hash.ts:48`) — the URL is canonicalised
   (hash dropped, `utm_*`/`gclid`/`fbclid` stripped, params sorted, host
   lowercased, trailing slash removed) and SHA-256'd. Fetched sources hash their
   URL rather than their content because the content does not exist yet.
4. **`createAndEnqueue`** (line 61) — the single funnel every source type goes
   through:
   - `assertNotDuplicate` → `409` naming the existing source
     (`sources_notebook_content_hash_key` is unique per *notebook*, so the same
     video in two notebooks is fine).
   - `INSERT INTO sources` with `status = 'QUEUED'` and a placeholder title
     (`YouTube video dQw4w9WgXcQ`) — nothing knows the real title yet.
   - No bytes for a YouTube source (`input.bytes` is undefined; PDFs and VTTs
     write to `source_files` here instead).
   - `touchNotebook`, then **`enqueueIngest({ sourceId, requestId })`**.

   **Row before job, always.** A worker must never pick up a job whose row is
   not yet visible.

The response is a `SourceDto` (`toDto`, line 16) and comes back in well under
500ms. Nothing has touched YouTube at this point.

### Layer 7. The queue (Redis)

**`server/src/queues/index.ts:72`** — `ingestQueue.add("ingest-source", data,
INGEST_OPTIONS)`: 3 attempts, exponential backoff from 5s. Ingestion is slow and
retryable; chat deliberately is not (`attempts: 1`, line 37, because a retry
would replay tokens the browser already rendered).

`enqueueReindex` uses the same queue with the job name `reindex-source` — that
name is the only difference between a first index and a re-index.

### Layer 8. Worker pickup

**`server/src/worker.ts`** — a separate process. `WORKER_QUEUES` decides which
queues it consumes, so chat can be split onto its own process at deploy time
without a code change. `ensureCollection()` bootstraps Qdrant before any worker
starts.

**`server/src/workers/ingest.worker.ts:29`** — concurrency 4, `lockDuration`
15s, `stalledInterval` 5s, and a 10-minute ceiling enforced with `pTimeout`
around the processor (BullMQ removed per-job timeouts). On the **final** attempt
only, the failure handler marks the source `FAILED` with the error message
(line 49) — earlier attempts must not show the user a red dot.

### Layer 9. The ingestion pipeline

**`server/src/ingestion/pipeline.ts:27`** — `runIngestion(sourceId, reindex)`.

#### 9a. EXTRACTING (progress 0 → 40)

`extract()` (line 191) sets status `EXTRACTING`, loads any stored bytes (none
for YouTube), picks the extractor by source type, and passes an `onProgress`
callback that scales every extractor-reported percentage into the first 40% of
the bar (line 216).

**`server/src/ingestion/extractors/youtube.extractor.ts`**

`parseYoutubeUrl` runs again on `originalUrl` (line 210).

*If it is a playlist* → `fetchPlaylist` returns video ids, each becomes a
`SiblingSource` (line 221), and `expandPlaylist` in the pipeline (line 238)
inserts one `QUEUED` row per video and enqueues each. The playlist row itself
holds **no chunks** — it is a container that goes straight to `READY`. Videos
already in the notebook trip the hash constraint and are skipped; if every one
is a duplicate, the playlist fails with a message saying so.

*If it is a video* → `liveYoutubeClient.fetchTranscript(videoId)` (line 63),
which is a cascade of four routes:

| # | Route | Gives | Why in this order |
|---|-------|-------|-------------------|
| 0 | `youtubei.js` `getInfo` | title, author, duration, **caption track list** | The player must be retrieved or `caption_tracks` comes back empty and every video looks caption-less |
| 1 | **yt-dlp** (`server/src/lib/ytdlp.ts:63`) | cues **with timings** | Timings are what make the transcript clickable and the player followable. This runs first for that reason alone |
| 2 | LangChain `YoutubeLoader` (`server/src/lib/youtube-langchain.ts:20`) | one block of plain text | Always produces something readable when yt-dlp is missing — but the timeline is lost |
| 3 | `info.getTranscript()` | cues | Usually fails now; YouTube's `timedtext` endpoint returns empty without a proof-of-origin token |

Zero caption tracks → `ExtractionError("This video has no captions…")`. Tracks
that exist but cannot be fetched get a different, longer message (line 156) that
says it is YouTube's restriction, not a setting on the video, and names the
fix — the distinction matters because conflating the two sent people looking
for a switch to flip on a video they may not own.

yt-dlp specifics worth knowing:
- One language per invocation (line 70). Passing several at once means a single
  failure aborts the run.
- Ordering is English first, then the tracks the video actually has
  (`orderLanguages`, line 128). Asking for a language a video lacks makes yt-dlp
  request an auto-translation, which YouTube answers with a 429 — hardcoding
  `en` turned every non-English video into a rate-limit error.
- `--convert-subs srt`, because auto-generated VTT carries per-word timing tags
  and repeats each line as it rolls up the screen.
- `collapseRolling` (line 181) removes the word-level overlap between
  consecutive rolling cues. Without it every phrase is indexed two or three
  times and one sentence crowds out the real results.

The extractor then turns cues into `Block`s (line 242):

```ts
{ text: "…", locator: { kind: "timed", startSec: 132.4, endSec: 138.9 } }
```

If the route returned only text, `paragraphBlocks` (line 281) emits
`{ kind: "text", startChar, endChar }` locators instead — offsets measured
against the original string. Inventing a plausible timestamp would be worse
than not having one.

Returned `metadata`: `videoId`, `cueCount`, `captionTracks`, `captionLanguage`,
`author`, `durationSec`.

Back in the pipeline:
- **The source is renamed** from the extracted title (line 55) — this is the
  first moment anything knows the video is called something other than
  `YouTube video <id>`. Guarded by `renamed`, so a title the person chose
  survives a re-index.
- **Metadata is merged, not replaced** (line 68), so a field written by an
  earlier stage is not lost.

#### 9b. CHUNKING (progress 45)

**`server/src/services/rag/chunker/index.ts:27`** dispatches on locator shape:
`YOUTUBE` and `VTT` → `chunkTimed`, everything else → `chunkProse`.

**`server/src/services/rag/chunker/timed.chunker.ts:16`** — cues merge forward
until the chunk holds ~60–90s of speech (`minSpeechSec`/`maxSpeechSec`) or hits
`CHUNK_TARGET_TOKENS` (default 900), whichever comes first, with **one cue of
overlap** so a sentence spanning a boundary is retrievable from either side.
Past the minimum it closes on the next sentence end rather than running to the
ceiling. Cue boundaries are never broken — the whole point of a time range is
that clicking it plays something coherent.

Each chunk's locator is the span of its group (`locator.ts:23`).
Zero chunks → `ExtractionError("Nothing could be indexed from this source.")`.

#### 9c. Devanagari translation (conditional)

**`pipeline.ts:161`** — `translateForSearch`. If the first 8 chunks are more
than 40% Devanagari and an LLM key is configured, every chunk's text is
translated to English via `captions.service.ts:342` (`translateTexts`,
1,600-char batches, 8 concurrent, structured output keyed by line number).

This happens **after** chunking, deliberately: the locators are already fixed,
so a citation still opens the exact second it always did and only the embedded
text changes. `metadata.captionLanguage` is set to `en-x-mt` so the viewer opens
on the translation and marks it as one. A failed translation logs and indexes
the original rather than failing the source.

Why at all: an English question against a Devanagari corpus does not retrieve
badly, it retrieves *nothing* — the keyword channel is looking for a string that
is absent in any form, and the vector channel is comparing English to
Devanagari spellings.

#### 9d. EMBEDDING (progress 65 → 90)

Order matters and is load-bearing:

1. **`replaceChunksForSource`** (`server/src/db/repositories/chunk.repository.ts:11`)
   — deletes and re-inserts the whole set in one transaction, returning rows
   with ids. Rows first, so each vector can carry the chunk id it belongs to.
   The `tsv` column is *generated by Postgres* from `text`, so it can never
   drift from what it indexes.
2. **`provider.embedDocuments`**
   (`server/src/providers/embedding/openai.provider.ts:52`) — batches of 96,
   concurrency 4, `p-retry` with exponential backoff per batch, and a hard check
   that the vector count equals the text count (a mismatch would silently pair
   every chunk with someone else's vector).
3. **`buildPoints` + `upsertPoints`**
   (`server/src/vector/chunk.vector-repository.ts:15`) — each Qdrant point
   carries everything a citation needs (`notebookId`, `sourceId`, `sourceType`,
   `sourceTitle`, `chunkId`, `chunkIndex`, `locator`, `text`, `embeddingModel`),
   so rendering a citation needs no second database round trip. Upserted in
   batches of 256 with `wait: true`.

**The vector write is the last step.** A partially indexed source can never leak
into an answer; a failure halfway leaves the source unqueryable rather than half
answerable.

`embeddingModel` in the payload is not decoration — retrieval filters on it
(`search.ts:38`), so vectors from a previous embedding model become invisible
rather than being compared against the current one. Cosine distance between two
unrelated spaces is noise, and noise that outranks real passages is how a
notebook that plainly answers a question ends up refusing it.

#### 9e. READY (progress 100)

`indexedAt` is set and the final status is published.

### Layer 10. Status back to the browser

**`server/src/services/status.service.ts:10`** — the single place a source's
status changes. Postgres is written **first** and is authoritative; the
published event is only a notification, so a dropped frame costs a UI update and
not correctness.

**`server/src/lib/events.ts`** — `publish()` on channel `source:<notebookId>`.
A publish failure is logged and swallowed (line 43): losing a progress frame
must never fail the job reporting it.

**`server/src/lib/sse.ts:12`** — the API process holding the browser's
`GET /notebooks/:id/sources/events` connection subscribes to that channel and
forwards each payload **verbatim** (line 35, already JSON on the wire). 25s
keep-alive comments, `X-Accel-Buffering: no` so a reverse proxy does not sit on
the stream.

One stream per **notebook**, not per source (`source.route.ts:46`) — adding ten
PDFs opens one connection. The route is declared before `/:sourceId` or
`"events"` would be parsed as an id and rejected as a non-uuid.

**`client/src/features/sources/use-source-events.ts:28`** — `EventSource`
patches `status`, `statusStage`, `progress` and `errorMessage` straight into the
TanStack Query cache. `READY` and `FAILED` additionally trigger a refetch,
because those carry an `indexedAt` and possibly a real title that the event does
not include. After 3 consecutive stream errors it falls back to invalidating the
cache by hand, and `useSources` (`hooks.ts:19`) polls every 5s while any row is
unsettled — so status goes stale rather than frozen if SSE dies.

### The status sequence for one video

| Status | `statusStage` | Progress | Set by |
|--------|---------------|----------|--------|
| `QUEUED` | — | 0 | `source.service.ts` (API) |
| `EXTRACTING` | "Reading the source" | 15 | `pipeline.ts:194` |
| `EXTRACTING` | "Reading captions" | 24 | extractor `onProgress(…, 60)` × 0.4 |
| `CHUNKING` | "Splitting into chunks" | 45 | `pipeline.ts:74` |
| `EMBEDDING` | "Generating embeddings for N chunks" | 65 | `pipeline.ts:92` |
| `EMBEDDING` | "Writing to the vector store" | 90 | `pipeline.ts:111` |
| `READY` | — | 100 | `pipeline.ts:121` |
| `FAILED` | — | 0 | `ingest.worker.ts:59`, final attempt only |

The UI collapses these seven into four dots (`status.service.ts:44`).

---

## Part 2 — Asking a question about that video

**`POST /api/notebooks/:id/chats/:chatId/messages`**
(`server/src/routes/chat.route.ts:67`) never awaits a model call. It persists the
user message, inserts a placeholder assistant message with
`status: "streaming"`, enqueues the job, and then holds the response open as an
SSE relay (line 133).

The worker (`server/src/workers/chat.worker.ts` → `services/chat/answer.service.ts`)
runs the retrieval facade, `server/src/services/rag/retrieval/pipeline.ts:22`:

```
translate  -> query variants (HyDE, rewrites)          translate.ts
route      -> which channels: VECTOR / FTS / SQL       route.ts
search     -> every variant x every channel, in        search.ts
              parallel; notebook + source + embedding
              model filters applied inside the channel
fuse       -> reciprocal rank fusion, relevance floor  fusion.ts
rerank     -> top N                                    rerank.ts
grade      -> below floor? widen and repeat            grade.ts / corrective.ts
generate   -> streamed tokens                          prompts/answer.ts
citations  -> resolve markers to chunks                rag/citations.ts
```

Both content channels apply the notebook filter themselves — Qdrant via
`qdrantFilter` (`search.ts:29`), Postgres FTS in the `WHERE` clause
(`search.ts:125`) — *below* the layer that generates query variants, so a
generated HyDE passage cannot reach past the boundary.

For our video, a retrieved chunk carries
`locator: { kind: "timed", startSec, endSec }`, which is what turns a citation
chip into a click that seeks the player.

Every frame is also appended to a bounded Redis list, so a browser that drops
mid-answer reattaches through `GET …/messages/:id/stream`, replays what it
missed, and continues live.

---

## Part 3 — Viewing the video afterwards

**`GET /api/notebooks/:id/sources/:sourceId/content`**
(`server/src/controllers/source-content.controller.ts:20`) — for `YOUTUBE` it
reassembles cues **from the chunk locators in Postgres**, not from a fresh
download. Those are the exact strings the answer was written from and the exact
ranges its citations point at; re-downloading risks a transcript that no longer
lines up with the highlight.

Returns `{ kind: "timed", cues, videoId, durationSec, tracks, track }`.
`videoId` falls back to parsing `originalUrl` when metadata predates the field,
so old sources still render their player without a re-index.

**`GET …/captions?track=<code>`** (line 157) — one language, on demand.
`captions.service.ts:86` decides what is on offer:

| Kind | Example | How it is produced |
|------|---------|--------------------|
| `native` | `en`, `hi` | Downloaded with `fetchCaptionsInLanguage` |
| `romanized` | `hi-Latn` (Hinglish) | Devanagari cues transliterated — exact, same words |
| `translated` | `en-x-mt` | Model translation of the indexed cues — marked as such |

Derived tracks are built from the **indexed** cues, so every language keeps the
same timeline and a citation highlights the same moment whichever one you are
reading. Results are cached in Redis for 7 days.

---

## Failure modes, and where each is decided

| What went wrong | Where | What the user sees |
|-----------------|-------|--------------------|
| Not a URL / not YouTube / no id in it | `lib/youtube.ts:23` | 400, named reason |
| URL resolves to a private or internal address | `lib/url-safety.ts:61` | 400 |
| Video already in this notebook | `source.service.ts:44` | 409 naming the existing source |
| Too many adds in a minute | `middleware/rate-limit.ts:24` | 429 |
| Video is private or removed | `youtube.extractor.ts:70` | `FAILED` + message |
| No caption track at all | `youtube.extractor.ts:80` | `FAILED`, "upload a VTT/SRT instead" |
| Tracks exist, YouTube will not serve them | `youtube.extractor.ts:156` | `FAILED`, explains it is their side, names the fix |
| Transcript came back empty | `youtube.extractor.ts:249` | `FAILED` |
| Chunking produced nothing | `pipeline.ts:84` | `FAILED` |
| Translation failed | `pipeline.ts:183` | Nothing — indexes the original |
| Embedding batch failed | `openai.provider.ts:34` | Retried 4× per batch, then the job retries |
| Whole job over 10 minutes | `ingest.worker.ts:16` | `FAILED` with a timeout reason |
| Redis publish failed | `lib/events.ts:43` | Nothing — SSE frame lost, polling catches up |
| SSE dropped | `use-source-events.ts:79` | Falls back to 5s polling |

Anything that reaches `FAILED` is recoverable from the UI: `POST
…/sources/:id/reindex` (`source.service.ts:207`) resets the row to `QUEUED` and
enqueues a `reindex-source` job, which tears the old chunks and vectors down
first (`pipeline.ts:35`) so two generations can never answer the same question.

---

## File index for this path

| Layer | File |
|-------|------|
| Dialog | `client/src/components/sources/add-source-dialog.tsx` |
| Mutation | `client/src/features/sources/hooks.ts` |
| HTTP call | `client/src/features/sources/api.ts` |
| Fetch wrapper | `client/src/lib/api-client.ts` |
| Live status | `client/src/features/sources/use-source-events.ts` |
| App wiring | `server/src/app.ts` |
| Auth | `server/src/middleware/session.ts` |
| Notebook scope | `server/src/middleware/ownership.ts` |
| Routing | `server/src/routes/notebook.route.ts`, `server/src/routes/source.route.ts` |
| Validation | `server/src/schemas/source.schema.ts`, `server/src/middleware/validate.ts` |
| Controller | `server/src/controllers/source.controller.ts` |
| Business rules | `server/src/services/source.service.ts` |
| URL parsing | `server/src/lib/youtube.ts` |
| SSRF guard | `server/src/lib/url-safety.ts` |
| Dedupe hash | `server/src/lib/hash.ts` |
| Queue | `server/src/queues/index.ts` |
| Worker process | `server/src/worker.ts`, `server/src/workers/ingest.worker.ts` |
| Pipeline | `server/src/ingestion/pipeline.ts` |
| Extractor | `server/src/ingestion/extractors/youtube.extractor.ts` |
| Caption fetch | `server/src/lib/ytdlp.ts`, `server/src/lib/youtube-langchain.ts` |
| Chunking | `server/src/services/rag/chunker/timed.chunker.ts`, `.../locator.ts` |
| Translation | `server/src/services/captions.service.ts` |
| Chunk rows | `server/src/db/repositories/chunk.repository.ts` |
| Embeddings | `server/src/providers/embedding/openai.provider.ts` |
| Vectors | `server/src/vector/chunk.vector-repository.ts` |
| Status + events | `server/src/services/status.service.ts`, `server/src/lib/events.ts`, `server/src/lib/sse.ts` |
| Retrieval | `server/src/services/rag/retrieval/pipeline.ts`, `.../search.ts` |
| Viewer | `server/src/controllers/source-content.controller.ts` |
| Schema | `server/src/db/schema/sources.ts`, `server/src/db/schema/chunks.ts` |
</content>
</invoke>
