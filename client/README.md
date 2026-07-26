# Notebook RAG, client

The frontend: Next.js 16, App Router, TypeScript, Tailwind CSS v4, shadcn/ui on Base UI. This project is self contained and holds no database, queue or model credentials. Every model call and every storage access happens on the server.

## Prerequisites

- Node.js 20.9 or newer (developed on 24)
- A running API. **Start `server/` first**, otherwise this app renders but every request fails.

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev              # http://localhost:3000
```

## Environment

One variable, and that is the whole client surface:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

The API must allow this origin. It reads `WEB_ORIGIN` on its side, which defaults to `http://localhost:3000`.

## Scripts

| Script          | Does                                 |
| --------------- | ------------------------------------ |
| `npm run dev`   | Dev server                           |
| `npm run build` | Production build                     |
| `npm start`     | Serve the build                      |
| `npm run lint`  | ESLint                               |
| `npm run e2e`   | Playwright, against a running server |

## Layout

```
src/
  app/
    page.tsx                notebook list
    notebook/[id]/page.tsx  the workspace
  components/
    layout/                 shell, rail, top bar, error boundaries
    notebooks/              list, create, rename, delete, Cmd+K switcher
    sources/                add dialog, rows with status dots
    chat/                   transcript, composer, markdown with citation pills
    viewer/                 pdf, timed, text and web viewers
    artifacts/              roadmap stepper, podcast player
    ui/                     shadcn generated
  features/                 per feature: api client, query hooks, mutations
  stores/                   zustand, UI state only
  lib/
    api-client.ts           fetch wrapper, unwraps the { data } / { error } envelope
    query-keys.ts           one factory for every cache key
    source-status.ts        the four dots, derived from seven statuses
  types/api.ts              mirrors server/src/types/api.ts
```

## How state is divided

**Server data lives in TanStack Query.** Notebooks, sources, messages and artifacts are never copied into a store, so there is one answer to "what is the current list".

**Zustand holds UI state only**: which notebook is open, whether the rail or the viewer is open, and which citation the viewer should land on.

**The URL is the source of truth for the open notebook.** `/notebook/[id]` means a reload keeps your place, the back button behaves, and a link is shareable.

## Live updates

Two streams, both server sent:

- **Source status** (`/sources/events`), one per notebook. Rows move grey to yellow to green without a refetch. Polling is the fallback if the stream drops.
- **Chat** (`POST /messages`), one per answer. Phase events narrate the pipeline, then tokens arrive. If the connection drops mid answer, `GET /messages/:id/stream` replays what was missed and continues live.

## Notes on the component library

shadcn now generates components on **Base UI**, not Radix. The API differs in ways worth knowing: composition uses `render={<Component />}` rather than `asChild`, menu items dispatch `onClick` rather than `onSelect`, and `TooltipProvider` takes `delay` rather than `delayDuration`. `CommandDialog` renders only the dialog chrome, so the cmdk root has to be supplied by the caller.
