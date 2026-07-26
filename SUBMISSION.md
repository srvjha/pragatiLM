# pragatiLM

An AI research assistant. Create a notebook, add your sources, and ask questions
answered **only** from those sources. Every claim carries a marker that opens the
exact page, timestamp or paragraph it came from. When the sources cannot support
an answer, it says so rather than inventing one.

## Stack

| | |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind v4, shadcn on Base UI |
| Backend | Express 5, TypeScript, BullMQ workers |
| Data | Postgres 16 (Drizzle), Qdrant, Redis |
| AI | LangChain — OpenAI embeddings and chat, Cohere rerank |
| Auth | Better Auth — email/password, Google, GitHub |

Two independent projects, `server/` and `client/`, talking only over HTTP and SSE.
No workspace, no shared lockfile, no cross-project imports.

## Running it

```bash
cd server
docker compose up -d          # Postgres, Redis, Qdrant
cp .env.example .env          # add OPENAI_API_KEY
npm install && npm run db:migrate
npm run dev                   # API on :4000
npm run dev:worker            # queue workers, second terminal

cd ../client
cp .env.example .env.local
npm install && npm run dev    # app on :3000
```

Open `http://localhost:3000` and create an account.

## Features

- **Five source types** — PDF, YouTube, web page, VTT/SRT, pasted text
- **Advanced RAG** — query translation (rewrite, step-back, sub-questions, HyDE),
  routing across vector / keyword / SQL, reciprocal rank fusion, cross-encoder
  reranking, and a bounded corrective loop that grades the context before
  generating and searches again if it is not good enough
- **Resolvable citations** — click a marker and the source opens at the cited
  page with the passage highlighted
- **Refuses** rather than guessing when the retrieved set cannot support an answer
- **Learning roadmap** from video sources, each module pinned to timestamps
- **Podcast** — two-host script written only from your sources, with the script
  beside the player
- **Analytics dashboard** — citation coverage, refusal rate, correction rounds
- Async throughout: the API only enqueues, workers do the work, progress streams
  over SSE

## Design notes

**Citations are the product.** A chunk stops at a page boundary even when the
token budget allows more, because a citation that opens on the wrong page is
worse than a smaller chunk. Locators and snippets are copied onto the citation,
so old answers still resolve after a re-index.

**Every retrieval stage is switchable.** With all of them off it degrades to
plain hybrid search and still answers, which keeps each stage's contribution
measurable. `npm run eval` reports hit rate and MRR per configuration.

**Isolation is enforced in the query layer**, not the UI. Retrieval filters by
notebook, and a notebook belonging to another user answers 404 rather than 403,
because a 403 would confirm the id exists.

## Testing

```bash
cd server && npm test     # 137 tests, real Postgres and Qdrant
cd client && npm run e2e  # Playwright
```

The suite forces the fake embedding provider and reports no model credentials,
so it behaves identically with or without an API key.

## Known limitations

- **YouTube captions** need `yt-dlp` installed (`brew install yt-dlp`). YouTube
  stopped serving caption tracks to third parties, so no library reaches them
  directly. Uploading the transcript as VTT always works.
- No password reset — no mail transport configured.
- Uploaded files are stored in Postgres, which suits a small deployment.
- Retrieval latency is above the 3 second target with every stage on.

## Docs

`README.md` for the full write-up, `docs/ARCHITECTURE.md` for components and
data flow, `docs/RETRIEVAL.md` for one real question traced end to end.
