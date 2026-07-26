# Architecture

## Components

```
                        browser
                           |
              HTTP + SSE   |
                           v
    +----------------------------------------+
    |  client/  Next.js                       |
    |  TanStack Query for server state        |
    |  Zustand for UI state only              |
    +----------------------------------------+
                           |
                           v
    +----------------------------------------+
    |  server/  Express API                   |
    |  validates, enqueues, relays            |
    |  never awaits a model call              |
    +----------------------------------------+
         |            |                |
         v            v                v
    +---------+  +---------+   +--------------+
    | Postgres|  |  Redis  |   |    Qdrant    |
    | rows +  |  | queues  |   |   vectors    |
    | bytes   |  | pub/sub |   |              |
    +---------+  +---------+   +--------------+
                      ^                ^
                      |                |
    +----------------------------------------+
    |  server/  worker process                |
    |  ingest, chat, cleanup, roadmap, podcast|
    |  all model calls happen here            |
    +----------------------------------------+
```

The API and the worker share a codebase and a parsed env, and nothing else. `WORKER_QUEUES` decides what a worker process consumes, so chat can run on its own process in deploy without a code change.

## Ingestion

```
POST /sources/*
   |
   |  validate, hash, dedupe, store bytes, insert row as QUEUED
   |  respond in under 500ms
   v
 ingest queue
   |
   v
 worker: EXTRACTING -> CHUNKING -> EMBEDDING -> READY
   |          |            |            |
   |          |            |            +-- vectors upserted only after every
   |          |            |                embedding for the source succeeds
   |          |            +-- chunk rows written first, so each vector carries
   |          |                the chunk id it belongs to
   |          +-- locator per chunk: page, char range, or time range
   +-- one extractor per type behind a shared interface
   |
   v
 status published to Redis at every stage, relayed to the browser over SSE
```

A partially indexed source can never leak into an answer, because the vector write is the last step. A failure halfway leaves the source unqueryable rather than half answerable.

## A query

```
browser                  API                    worker                 stores
   |                      |                       |                      |
   |-- POST /messages --->|                       |                      |
   |                      |-- persist question -->|                      |
   |                      |-- enqueue ----------->|                      |
   |<-- SSE opens --------|                       |                      |
   |                      |                       |-- translate -------->| (model)
   |<-- query_translated -|<---- publish ---------|                      |
   |                      |                       |-- route              |
   |<-- routing ----------|<---- publish ---------|                      |
   |                      |                       |-- search ----------->| Qdrant + PG
   |                      |                       |-- fuse, rerank       |
   |                      |                       |-- grade ------------>| (model)
   |<-- grading ----------|<---- publish ---------|                      |
   |                      |                       |   below floor?       |
   |<-- correction -------|<---- publish ---------|   widen and repeat   |
   |<-- retrieval_done ---|<---- publish ---------|                      |
   |                      |                       |-- generate --------->| (model)
   |<-- token ------------|<---- publish ---------|   (streamed)         |
   |<-- citations --------|<---- publish ---------|-- resolve markers    |
   |<-- done -------------|<---- publish ---------|-- persist message    |
   |                      |                       |-- grade answer ----->| (model)
   |<-- answer_grade -----|<---- publish ---------|   (after the stream) |
```

Every frame is also appended to a bounded Redis list, so a browser that drops mid answer reattaches through `GET /messages/:id/stream`, replays what it missed, and continues live.

## Design patterns, and where each one earns its place

| Pattern | Where | What it buys |
|---------|-------|--------------|
| Strategy | Extractors, chunkers, providers | Five source types differ only in how bytes become blocks with locators. A sixth is a new file and a map entry |
| Factory | `extractorFor`, `embeddingProvider`, `chatModel` | Selection reads from config in one place, so tests build the same graph with fakes |
| Repository | `db/repositories`, `vector/` | Services never hold a query, and the notebook filter is applied in one auditable place |
| State | The source lifecycle | Legal transitions live in one service, so an illegal one cannot strand a row |
| Command | BullMQ jobs | A job carries everything it needs, so it can be retried or replayed |
| Observer | Redis pub/sub to SSE | The worker publishes without knowing whether anyone is watching |
| Facade | `retrieval/pipeline.ts` | The chat service asks for context and gets blocks; translation, fusion and reranking stay behind one call |

Deliberately not used: a DI container (factories and module scope are sufficient at this size), event sourcing on the source lifecycle (the status column plus the trace answers every question we actually ask), and LangGraph for the corrective loop (its value is scheduling between independent nodes; this loop has one node and one conditional edge, and a graph would make the retry bound harder to see).

## Notebook isolation

Enforced in three places, not one:

1. **Route level.** `resolveNotebook` resolves `:notebookId` once, and a child resource under the wrong notebook is a 404 rather than a 200.
2. **Query level.** Every repository function is scoped by notebook. A source id alone is never enough to reach a row.
3. **Vector level.** Both retrieval channels apply the notebook filter themselves, below the layer that generates query variants, so a HyDE passage cannot reach past it.

Covered by a test that seeds two notebooks with near identical content and asserts zero cross notebook retrieval, including through generated variants.
