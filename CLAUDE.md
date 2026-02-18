# Mission Control

AI Agent Orchestration Dashboard — manages tasks through an AI-driven planning pipeline and dispatches work to agents via OpenClaw.

## Quick Reference

```bash
npm run dev          # Start dev server on port 17789
npm run build        # Production build
npm run lint         # ESLint
npm run db:seed      # Seed database
npm run db:reset     # Drop & reseed database
npm run db:backup    # Backup SQLite DB
npm run db:restore   # Restore from backup
```

## Tech Stack

- **Framework:** Next.js 14 (App Router) + React 18 + TypeScript 5
- **Styling:** Tailwind CSS with custom `mc-*` dark theme (JetBrains Mono font)
- **State:** Zustand v5, React Query (@tanstack/react-query) for server data caching
- **Database:** SQLite via better-sqlite3 (auto-migrating on startup)
- **Real-time:** Server-Sent Events (SSE) with polling fallback
- **AI Integration:** OpenClaw Gateway (WebSocket)
- **Icons:** Lucide React

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── agents/         # Agent CRUD
│   │   ├── tasks/          # Task CRUD, planning, dispatch
│   │   │   └── [id]/
│   │   │       ├── planning/       # AI planning Q&A flow
│   │   │       │   └── answer/     # Submit planning answers
│   │   │       └── dispatch/       # Dispatch task to agent
│   │   ├── events/stream/  # SSE endpoint
│   │   ├── openclaw/       # Gateway proxy
│   │   └── workspaces/     # Multi-workspace support
│   ├── workspace/[slug]/   # Workspace dashboard page
│   └── settings/           # Settings page
├── components/
│   ├── MissionQueue.tsx    # Kanban board (7 columns)
│   ├── TaskModal.tsx       # Task detail/edit modal
│   ├── PlanningTab.tsx     # AI planning interface
│   ├── AgentsSidebar.tsx   # Agent list panel
│   ├── LiveFeed.tsx        # Real-time event stream
│   └── ...
├── lib/
│   ├── db/
│   │   ├── schema.ts       # Table definitions
│   │   ├── migrations.ts   # Auto-run migrations
│   │   ├── index.ts        # DB singleton + queries
│   │   └── seed.ts         # Seed data
│   ├── openclaw/client.ts  # WebSocket client singleton
│   ├── store.ts            # Zustand store
│   ├── types.ts            # All TypeScript types/interfaces
│   ├── events.ts           # SSE broadcast utility
│   └── charlie-orchestration.ts  # Agent workflow helpers
└── hooks/
    ├── useSSE.ts           # SSE connection hook
    └── useModelLimits.ts   # Model limits hook (React Query)
```

## Key Patterns

- **Path alias:** `@/*` maps to `./src/*`
- **Drag & drop:** Native HTML5 API with optimistic Zustand updates + PATCH API persistence
- **Task flow:** planning → inbox → assigned → in_progress → testing → review → done
- **Agent statuses:** standby | working | offline
- **Planning flow:** User creates task with planning mode → OpenClaw AI asks multiple-choice questions → generates spec + agents → auto-dispatches first agent
- **SSE broadcasting:** `broadcast()` from `src/lib/events.ts` notifies all connected clients
- **OpenClaw sessions:** `agent:main:planning:{taskId}` for planning, `agent:main:{sessionId}` for dispatch

## Tailwind Theme

Custom dark theme colors prefixed with `mc-`:
- `mc-bg` (#0d1117), `mc-bg-secondary`, `mc-bg-tertiary`
- `mc-text` (#c9d1d9), `mc-text-secondary`
- `mc-accent` (#58a6ff) — primary blue
- Status colors: `mc-green`, `mc-yellow`, `mc-red`, `mc-purple`, `mc-pink`, `mc-cyan`

## Environment Variables

```
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=<token>
PORT=17789
```

## Deployment

After every code change, always redeploy:
```bash
npm run build && pm2 restart mission-control
```

## Conventions

- ESLint extends `next/core-web-vitals` and `next/typescript` (unused vars and `any` warnings are off)
- SQLite DB file: `mission-control.db` in project root (gitignored)
- API routes return JSON; errors use `{ error: string }` format
- Components use Tailwind utility classes exclusively (no CSS modules)
- Database migrations auto-run on first `getDb()` call
- API data fetching uses React Query hooks in `src/hooks/` — hooks encapsulate the query key, fetch function, and data transformation; components just call the hook
- `QueryClientProvider` is set up in `src/components/Providers.tsx`, wrapping the app in `layout.tsx`
