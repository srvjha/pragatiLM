# doChatLM

An AI research assistant. Create a notebook, add sources to it (PDF, text, web page, YouTube video, VTT transcript), and ask questions answered **only** from those sources. Every answer carries citations, and clicking one opens the original at the exact page, timestamp or character range the answer came from.

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

Check `http://localhost:4000/api/health`. It reports reachability for Postgres, Redis and Qdrant, and returns 503 if any of them is down.

**Without an API key**, set `EMBEDDING_PROVIDER=fake` in `server/.env`. Everything runs end to end: uploads, indexing, live status, the viewer. Retrieval returns meaningless results and questions are answered with a message saying no model is configured. Add `OPENAI_API_KEY` for real answers.

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
        |  below 6, retries left: take the grader's keywords,
        |  add them as variants, go back to ROUTING (max 3)
        |
        v  at or above 6
  GENERATION                     streamed, original question + numbered blocks
        |
        v
  ANSWER GRADE                   after the stream, drives the ungrounded flag
```

**Why fuse across variants.** A chunk found by the rewrite, the step back question and the HyDE passage is far more likely to be the right one than a chunk that led a single list. That agreement is the entire reason for generating variants, and reciprocal rank fusion is what turns it into a ranking.

**Why grade the context rather than the answer.** Grading a finished answer before showing it would put a whole generation in front of the first token. A low grade tells you to retrieve differently anyway, which is exactly what a retry can fix. The answer is still graded, after the stream, where it costs the reader nothing.

**Why the best round wins.** A correction can make things worse. Keeping the worse set because it happened to come second would be absurd, so every round is scored and the best one reaches the model.

Every stage is switchable by env. With all of them off the product degrades to plain hybrid retrieval and still answers, which keeps each stage's contribution measurable rather than assumed.

## Chunking, and why citations depend on it

Chunking is per source type, because locators differ.

- **Prose (PDF, web, text)**: blocks accumulate to a 900 token target with 150 tokens of overlap, splitting on paragraph then sentence boundaries.
- **Timed media (YouTube, VTT)**: cues merge forward to 60 to 90 seconds of speech or the token target, with one cue of overlap, and never break a cue.

One rule matters more than the sizes: **a chunk stops whenever the next block would make its locator a lie.** For a PDF that means a page boundary wins over the token target. Without it, a 900 token chunk swallows three short pages and cites the first while the answer came from the third. That costs some chunk size on documents with short pages and buys a citation that opens on the right page every time.

## Supported sources and their limits

| Type | Limit | Locator |
|------|-------|---------|
| PDF | 50 MB, several at once | Page number |
| Text | Paste or `.txt` / `.md` | Character range |
| Web | Any article page | Heading path plus character range |
| YouTube | Video or playlist | Timestamp range |
| VTT / SRT | `.vtt` or `.srt` | Timestamp range |

Not supported, by design: OCR of scanned PDFs, and transcription of videos with no caption track. Both are detected and reported with a message saying what to do instead.

## Known limitations

- Single user. There is no auth; the schema reserves `userId` so adding it is additive.
- Stored bytes live in Postgres, which is right for one user on a laptop and wrong for many users on one database. The repository interface is `put`/`stat`/`get`/`remove`, so moving to object storage rewrites one file.
- Uploads are held in memory, so ten 50 MB PDFs at once is 500 MB resident.
- The SSRF check resolves the hostname at create time and again at fetch time, which closes the obvious hole but not every rebinding race.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), components and data flow
- [`server/README.md`](server/README.md), API reference, queues, troubleshooting
- [`client/README.md`](client/README.md), the frontend

The full specification lives in `../doc-chat/`: `PRD.md`, `REQUIREMENTS.md` and `PLANNING.md`.
