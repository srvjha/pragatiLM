# pragatiLM

An AI research assistant. Create a notebook, add sources to it (PDF, text, web page, YouTube video, VTT transcript), and ask questions answered **only** from those sources. Every answer carries citations, and clicking one opens the original at the exact page, timestamp or character range the answer came from. When the sources cannot support an answer, it says so instead of inventing one.

This folder is a container, not a project. It holds **two fully independent projects** that communicate only over HTTP and SSE:

- **[`server/`](server/README.md)** is the backend: Express API, queue workers, and the `docker-compose.yml` for its three backing services. Clone it alone and it runs.
- **[`client/`](client/README.md)** is the frontend: Next.js. Clone it alone and it runs, given an API to point at.

There is no root `package.json`, no workspace, no shared lockfile and no cross project imports.

## Quickstart

Three terminals. The server must be up before the client is useful.

```bash
# 1. backing services and the API (from server/)
cd server
docker compose up -d
cp .env.example .env
npm install
npm run db:migrate
npm run dev            # http://localhost:4000

# 2. queue worker, second terminal, still in server/
npm run dev:worker

# 3. client, third terminal
cd ../client
cp .env.example .env.local
npm install
npm run dev            # http://localhost:3000
```

Open `http://localhost:3000` and create an account. Email and password needs no third party credential, so the product is usable the moment the database is up.

Check `http://localhost:4000/api/health`. It reports reachability for Postgres, Redis and Qdrant separately, and returns 503 if any of them is down.

**The one key worth adding** is `OPENAI_API_KEY` in `server/.env`. Without it, set `EMBEDDING_PROVIDER=fake` and everything still runs end to end — uploads, indexing, live status, the viewer — but retrieval returns meaningless results, because the vectors carry no semantics.

**The environment is parsed once at boot.** Editing `server/.env` does nothing until you restart the API and the worker.

## Accounts

Authentication is [Better Auth](https://better-auth.com) against the same Postgres database.

- **Email and password** is always on and needs no credential.
- **Google and GitHub** register only when both halves of their credential are present, so an unfilled `.env` shows one working method rather than buttons that fail on click.

Every notebook belongs to exactly one account, enforced in the API rather than in the UI. A notebook belonging to someone else answers **404 rather than 403**, because a 403 would confirm the id is real. There are tests for this.

Password reset is not implemented: there is no mail transport configured.

## How a question becomes a cited answer

The interesting part of this product is what happens between typing a question and reading an answer. A single vector lookup on the raw question is not good enough, and it fails in two distinguishable places.

**The question is often a poor search key.** It may be a follow up that means nothing standalone, a compound ask, or phrased in words the sources never use.

**Whatever comes back is normally accepted without anyone asking whether it is enough.**

```
question + last 4 turns
        |
        v
  QUERY TRANSLATION          one structured call, all variants at once
    original | rewrite | step back | sub questions | HyDE passage
        |
        v
  ROUTING                    heuristics first, model only when inconclusive
        |
        +-------------------+-------------------+
        v                   v                   v
   VECTOR              FTS                 SQL
   dense search        keyword search      generated metadata query
   (Qdrant)            (Postgres)          (read only, notebook scoped)
        |                   |                   |
        +---------+---------+                   |
                  v                             |
    RECIPROCAL RANK FUSION, k = 60              |
                  |                             |
                  v                             |
    RERANK to top 8  ->  RELEVANCE FLOOR        |
                  |                             |
                  +--------------+--------------+
                                 v
                          CONTEXT BLOCKS
                          quoted chunks, plus computed facts
                                 |
                                 v
  CONTEXT GRADE                  0 to 10, is this enough to answer
        |
        |  below CRAG_MIN_SCORE (6), retries left: take the grader's
        |  keywords, add them as variants, go back to ROUTING (max 3)
        |
        v
  REFUSE, or ANSWER              refusing needs a far lower bar than retrying:
        |                        below CRAG_REFUSE_BELOW (3), or nothing
        |                        retrieved at all
        v
  GENERATION                     streamed, original question + numbered blocks
        |
        v
  ANSWER GRADE                   after the stream, drives the ungrounded flag
```

**Why fuse across variants.** A chunk found by the rewrite, the step back question and the HyDE passage is far more likely to be the right one than a chunk that led a single list. That agreement is the entire reason for generating variants, and reciprocal rank fusion is what turns it into a ranking.

**Why grade the context rather than the answer.** Grading a finished answer before showing it would put a whole generation in front of the first token. A low grade tells you to retrieve differently anyway, which is exactly what a retry can fix. The answer is still graded, after the stream, where it costs the reader nothing.

**Why two thresholds.** "Search again" and "say nothing at all" are different decisions and were once the same number, so a set scoring 5 out of 10 was refused outright even when it plainly contained the answer. Refusing is the strongest thing this system does and takes a much lower score.

**Why the best round wins.** A correction can make things worse. Keeping the worse set because it happened to come second would be absurd, so every round is scored and the best one reaches the model.

Every stage is switchable by env. With all of them off the product degrades to plain hybrid retrieval and still answers, which keeps each stage's contribution measurable rather than assumed. `npm run eval` measures it: a labelled question set run across flag combinations, reporting hit rate and MRR per stage.

## Chunking, and why citations depend on it

Chunking is per source type, because locators differ.

- **Prose (PDF, web, text)**: blocks accumulate to a 900 token target with 150 tokens of overlap, splitting on paragraph then sentence boundaries.
- **Timed media (YouTube, VTT)**: cues merge forward to 60 to 90 seconds of speech or the token target, with one cue of overlap, and never break a cue.

One rule matters more than the sizes: **a chunk stops whenever the next block would make its locator a lie.** For a PDF that means a page boundary wins over the token target. Without it, a 900 token chunk swallows three short pages and cites the first while the answer came from the third.

**The overlap obeys the same rule.** It has to, and once did not: the page boundary stopped the blocks merging and the carried tail walked the previous page's text across anyway, so every chunk after the first quoted one page while claiming the next. Overlap only buys reading continuity, and there is none across a page break.

## Supported sources and their limits

| Type | Limit | Locator |
|------|-------|---------|
| PDF | 50 MB, several at once | Page number |
| Text | Paste or `.txt` / `.md` | Character range |
| Web | Any article page | Heading path plus character range |
| YouTube | Video or playlist | Timestamp range, or character range |
| VTT / SRT | `.vtt` or `.srt` | Timestamp range |

**YouTube needs help.** YouTube stopped serving caption tracks to third parties: the timedtext endpoint returns an empty body and the transcript API answers 400, for every video, including ones with dozens of hand written tracks. Captions are attempted through LangChain's `YoutubeLoader` first and then `yt-dlp` if it is installed (`brew install yt-dlp`), which is the route that also carries timings. A video that arrives without timings gets character ranges instead, so a citation opens the right passage but cannot seek the player to a second. Uploading the transcript as VTT or SRT always works.

Not supported, by design: OCR of scanned PDFs, and transcription of videos with no caption track. Both are detected and reported with a message saying what to do instead.

## Dashboard

`/app/dashboard` reports what is in the account and how well it is answering, scoped to the signed in user. The second group is the one worth acting on: citation coverage says whether answers are staying grounded, a climbing refusal rate says the corpus does not cover the questions being asked, and a median correction round above zero points at chunking or retrieval rather than the loop earning its keep.

## Known limitations

- **No password reset.** There is no mail transport configured.
- **Stored bytes live in Postgres**, which is right for a handful of users and wrong for many on one database. `MAX_UPLOAD_MB` defaults to 50 MB per file, so size the database accordingly.
- **Uploads are held in memory**, so ten 50 MB PDFs at once is 500 MB resident.
- **The SSRF check** resolves the hostname at create time and again at fetch time, which closes the obvious hole but not every rebinding race.
- **Retrieval latency** is above the 3 second target on the full pipeline. `npm run eval` will say which stage to drop.
- **Organisation level multi tenancy** — shared workspaces, roles — is out of scope. Accounts are individual.

## Testing

```bash
cd server && npm test          # 137 tests against a real Postgres and Qdrant
cd client && npm run e2e       # Playwright, needs the API and worker running
```

The suite forces the fake embedding provider and reports no LLM credentials, so it behaves the same whether or not you have a key. A test that only passes because a credential is missing proves nothing.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), components and data flow
- [`docs/RETRIEVAL.md`](docs/RETRIEVAL.md), one real question traced end to end
- [`server/README.md`](server/README.md), API reference, queues, troubleshooting
- [`client/README.md`](client/README.md), the frontend

The full specification lives in `../doc-chat/`: `PRD.md`, `REQUIREMENTS.md` and `PLANNING.md`.
