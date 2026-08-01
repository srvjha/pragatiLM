# The podcast: two hosts, one notebook

Someone opens the Podcast tab, picks a length and a language, and a few minutes
later has an audio conversation about their own sources, with the transcript
beside it marking the line being spoken.

This document is what the feature is for and why it is shaped the way it is,
followed by the trace through it. Read [ARCHITECTURE.md](./ARCHITECTURE.md)
first if you want the shape of the system; this is one feature inside it.

---

## The one-screen version

```
BROWSER                          API PROCESS                 WORKER PROCESS        STORES
podcast-panel.tsx
  CreateDialog
   | length, voices, language, sources
   v
features/artifacts/api.ts
   | POST /api/notebooks/:id/podcasts
   |------------------------------> podcast.route.ts
   |                                  INSERT podcasts (QUEUED/SCRIPTING) ------> Postgres
   |                                  podcastQueue.add ---------------------> Redis (BullMQ)
   |<-- 202 { data: row } ----------  (never waits for a model)
   |                                                        podcast.worker.ts
   |                                                          SCRIPTING
   |                                     chunks + sources <------ SELECT       Postgres
   |                                                          -> gpt-4.1-mini (structured)
   |                                     UPDATE title, script, RUNNING ------> Postgres
   |                                                          SYNTHESIZING
   |                                                          -> one TTS call per turn
   |                                                          -> ffprobe each segment
   |                                                          MIXING
   |                                                          -> ffmpeg concat
   |                                     INSERT podcast_audio (bytea) -------> Postgres
   |                                     UPDATE READY + duration + timings --> Postgres
   |
   | GET /podcasts (every 3s while running)
   |------------------------------> stage, progress, script
   |
   | GET /podcasts/:id/audio  (Range: bytes=...)
   |------------------------------> 206 partial mp3 --------------------------> <audio>
```

Nothing in this path touches Qdrant, embeddings or retrieval. That is
deliberate and explained below.

---

## Part 1 — The theory

### The claim the feature has to keep

The product's whole position is that an answer can be checked against the thing
it came from. Audio is the format where that is hardest: it arrives as a voice
with no citations, at the speed the voice chooses, and a listener has no way to
tell a sourced claim from an invented one.

So the podcast carries the same obligation as the chat. The script writer sees
only material derived from the notebook's own sources and is told to add
nothing. Every turn records the source ids it drew on, and any id the model
invents is dropped rather than believed
(`podcast.service.ts:127`). The transcript sits beside the player, always
visible, with the spoken line marked as it is spoken — so the claim can be read
while it is heard.

An episode nobody can check is a plausible voice, and a plausible voice saying
unsourced things is worse than no episode.

### Why two hosts

One narrator reading a summary is a different product — it is text-to-speech
over a document. Two voices produce something a summary cannot: a question. Host
A asks what a listener would ask and Host B answers, so the material arrives in
the order curiosity actually wants it rather than in the order the source
happens to be written in.

That also solves a practical problem: a two-voice format makes the speaker
change audible, which is what lets a listener track structure without seeing it.
The voice pairs are chosen as *pairs* for that reason
(`providers/tts/index.ts:34`) — what matters is not that a voice is nice, but
that the two are distinguishable from each other.

### Why it does not use retrieval

Every other answer in this product goes through the RAG stack: embed the
question, search Qdrant, fuse, rerank, grade. The podcast does none of that. It
reads the `chunks` table directly (`podcast.service.ts:67`).

There is no question to retrieve against. "Make an episode about this notebook"
has no query to embed, and the sensible corpus is the material itself rather
than the subset nearest to some invented query. So the material is assembled by
walking the chunks in order, capped at twelve per source, and handed over whole.

The honest cost: an episode is built from the *front* of each source, not from
its most important parts. A short video gives up its whole self; a 500-page book
gives up its first few chunks. This is why a long PDF makes a shallower episode
than its length suggests, and it is the first thing to change if episode quality
matters more than episode cost.

### Why the script is a schema, not prose

`buildScript` uses `withStructuredOutput` against a zod schema
(`podcast.service.ts:98`), so a turn arrives as `{ host, text, sourceIds }`
rather than as text to be parsed.

That is what makes attribution real. If the script came back as prose, "which
source does this line rest on" would be a guess recovered by pattern matching
after the fact. As a field, it is either present and checkable or absent — and
absent is honest. The same choice is what lets the player alternate voices
without inferring speakers from formatting.

### Why timings are measured, not estimated

The transcript follows the audio, which means every turn needs to know when it
is spoken. There are two ways to know.

The cheap way is to apportion the total duration by how much text each turn
holds. It costs nothing and it drifts: speech rate varies with sentence shape,
numbers and acronyms take longer than their character count implies, and over
ten turns the error accumulates until the highlight is a line or two behind the
voice. Which is precisely where a follow-along transcript stops being worth
having.

So each segment is measured with `ffprobe` at the moment it is synthesised
(`podcast.service.ts:184`), which is the only moment its length is knowable:
once the segments are concatenated the seams are gone and nothing in the file
marks where one turn ended. The offsets are stored on the turn itself.

Episodes made before this existed have no timings, and rather than leave their
transcripts inert the reader falls back to apportioning
(`podcast-panel.tsx:459`). The fallback is deliberately visible in one way: a
timestamp is printed only when it was measured, never when it was guessed,
because a figure printed to the second claims a precision an estimate does not
have.

### Why audio lives in Postgres

There is no object storage in this system. Uploaded files, captured web pages
and generated audio are all `bytea` columns, so the system of record is exactly
two stores: Postgres and Qdrant.

For a three-minute episode that is under a megabyte, and the simplicity is worth
real money: no bucket, no signed URLs, no lifecycle rules, no second thing to
back up, and an episode cannot outlive the row that owns it or vice versa. The
trade-off is that this does not scale to hours of audio per notebook, and the
day it needs to, the change is local to `saveEpisode` and the audio route.

### Why the request never waits

Generating an episode takes minutes: one model call for the script and one TTS
call per turn, all sequential. The route persists the row, enqueues the job and
returns `202` (`podcast.route.ts:55`). Everything after that happens in the
worker process.

The consequence is that the UI has to show progress it does not control, so the
worker writes the real stage onto the row as it goes and the panel polls every
three seconds while anything is running. The stage shown is the stage the job is
in — never a timed animation pretending to be one.

---

## Part 2 — The trace

### Layer 1. The dialog (browser)

**`client/src/components/artifacts/podcast-panel.tsx:600`** — `CreateDialog`
collects four things: length (3, 6 or 10 minutes), a voice pair, a language, and
which sources to draw from.

Two details are load-bearing. The voice pairs are **fetched** from the API
(`fetchVoicePairs`), not hardcoded, so the buttons and the values the server
validates cannot drift apart. And when every source is ticked the client sends
an empty list, which the server reads as "all of them" — so a source added
between opening the dialog and the job running is still included.

### Layer 2. The request (browser)

**`client/src/features/artifacts/api.ts:43`** — `createPodcast` posts
`{ sourceIds, lengthMinutes, voicePair, language }`.

```http
POST /api/notebooks/6f0e.../podcasts
Content-Type: application/json
Cookie: better-auth.session_token=...

{"sourceIds":[],"lengthMinutes":3,"voicePair":"warm","language":"hi"}
```

### Layer 3. The route (API process)

**`server/src/routes/podcast.route.ts:55`** — the body is validated by zod
(`createBody`, line 14), a row is inserted as `QUEUED`/`SCRIPTING` titled
`"Generating..."`, the job is enqueued with `attempts: 1`, and `202` comes back
with the row so the panel can show it immediately.

`attempts: 1` is a decision: a failed episode has usually already spent money on
a script and some voices, and retrying it silently spends that again.

### Layer 4. The queue

**`server/src/queues`** — BullMQ over Redis. The worker
(`workers/podcast.worker.ts:70`) runs at `concurrency: 1` with a
`lockDuration` of 15 minutes, because synthesising dozens of turns genuinely
takes that long and a shorter lock would let BullMQ reclaim the job as stalled
mid-episode and start it again.

### Layer 5. Scripting (worker)

**`server/src/services/podcast/podcast.service.ts:57`** — `buildScript`.

| Step | What happens |
|------|--------------|
| Select | `chunks` joined to `sources`, `READY` only, filtered to the chosen ids, ordered by `chunkIndex` |
| Cap | at most 12 chunks per source, so a long notebook cannot blow the context window |
| Assemble | one block per source, labelled `id=... "Title"` so turns can be attributed |
| Ask | `gpt-4.1-mini` at temperature 0.6, `withStructuredOutput(scriptSchema)` |
| Filter | source ids the model invented are removed |

The system prompt fixes the format (speech, not prose; no headings, no stage
directions), the target length (`minutes × 150` words), and the language
(`LANGUAGE_RULES`, line 48).

Hindi is not requested as pure Hindi. Nobody discussing databases in Hindi says
"आँकड़ा संरचना" — they say "database" inside a Hindi sentence, and a script that
translates every technical term reads as a textbook recital rather than as two
people talking.

The title and script are written to the row, and the status becomes `RUNNING`.

### Layer 6. Synthesis (worker)

**`podcast.service.ts:149`** — `synthesiseEpisode`, one call per turn, Host A in
the female voice and Host B in the male one.

**`server/src/providers/tts/index.ts:100`** — `createTts` is one implementation
of the OpenAI audio API, pointed wherever `TTS_BASE_URL` says. Unset means
OpenAI itself; it can equally address Kokoro on DeepInfra or a container on the
internal network.

The voice pair ids (`warm`, `bright`, `calm`) are the product's own vocabulary
and never change, because an episode records the id it was made with and has to
still mean something after the backend behind it is swapped. `TTS_VOICES` picks
the names underneath (line 34).

`instructions` steers delivery — how a Hindi line should be read, for example —
and is sent only to models known to accept it (`steerable`, line 96). Kokoro
rejects fields it does not recognise, and a parameter that fails one turn in
thirty is worse than one never sent.

Each segment is written to a temp directory, probed for its duration, and its
offset recorded on the turn.

### Layer 7. Mixing and saving (worker)

**`podcast.service.ts:211`** — `concat` merges the segments with ffmpeg. Plain
concatenation, no crossfade: each segment is one voice, so blending would blur
the handover rather than smooth it.

**`podcast.service.ts:235`** — `saveEpisode` writes in a single transaction: the
audio row is replaced, and the podcast row gets `READY`, its duration, and the
script *rewritten with the timings* that could not be known until the turns had
been spoken.

The temp directory is removed in a `finally`, so a failure halfway leaves no
orphaned audio on disk.

### Layer 8. Serving the audio (API process)

**`podcast.route.ts:100`** — the episode is served from `bytea` with real range
support (`parseRange`, line 160): a single range answers `206` with a
`Content-Range`, a suffix range means the last N bytes, and a range past the end
gets `416`.

This matters more than it looks. Advertising `Accept-Ranges: bytes` and then
returning the whole body with a `200` is a promise the response breaks: Chrome
tolerates it and loses seeking, while Safari asks for a range before it will
play at all and reads a `200` as a refusal.

### Layer 9. The player (browser)

**`podcast-panel.tsx:324`** — `Episode` owns one `<audio>` element and drives a
custom transport, with the transcript underneath.

The element carries **`crossOrigin="use-credentials"`**. Without it the whole
feature is dead: a media element sends no session cookie across origins unless
asked, so the request arrives unauthenticated, the API answers `401` in JSON,
and the player reports a format error for something that was never audio.

One episode is open at a time, chosen from a list beside it, and only that one
mounts a player — otherwise ten episodes mean ten media elements each fetching
metadata on load. The split is a **container query**, not a viewport one,
because this panel sits between two resizable columns: what decides whether
there is room for a list is the width of the panel, not of the screen.

---

## Data

```ts
type PodcastTurn = {
  host: "A" | "B";
  text: string;
  sourceIds: string[];   // validated against what was supplied
  startSec?: number;     // measured, absent on older episodes
  endSec?: number;
};
```

| Table | Holds |
|-------|-------|
| `podcasts` | title, `script` (jsonb `PodcastTurn[]`), status, stage, progress, `durationSec`, error |
| `podcast_audio` | `mimeType`, `sizeBytes`, `bytes` — one row per episode, replaced on regeneration |

Both cascade from the notebook, so deleting a notebook takes its episodes and
their audio with it.

---

## Configuration

| Variable | Default | What it does |
|----------|---------|--------------|
| `CHAT_MODEL` | `gpt-4.1-mini` | Writes the script |
| `TTS_BASE_URL` | *(empty)* | Empty means OpenAI; otherwise any service speaking the same API |
| `TTS_API_KEY` | falls back to `OPENAI_API_KEY` | Credentials for that service |
| `TTS_MODEL` | `gpt-4o-mini-tts` | The voice model |
| `TTS_VOICES` | `openai` | Which set of voice names the backend answers to |
| `TTS_VOICE_FEMALE` / `_MALE` | *(unset)* | Optional override for the `warm` pair only |

Roughly, per ten-minute episode: **~$0.15** on `gpt-4o-mini-tts`, against
**under a cent** for Kokoro on a per-character host, or **nothing** for Kokoro
run locally.

---

## What it deliberately does not do

- **Retrieve.** Explained above; the cost is depth on long sources.
- **Stream.** An episode is complete or it is not. Progressive playback would
  mean serving a file still being written, and the stage indicator already
  answers the question "is anything happening".
- **Persist the language.** It flows through the job to the prompt and the
  voice, but is not stored on the row, so nothing displays it and a future
  regeneration would not know it. The transcript makes it self-evident; a column
  is the fix if it ever needs to be filtered on.
- **Regenerate.** There is no "make this again" — a new episode is a new row.
- **Cross-fade or add music.** Both would sit between the material and the
  listener, and neither carries information.
