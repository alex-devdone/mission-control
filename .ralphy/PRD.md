# Mission Control — OpenClaw Agent Observatory

## Overview
Add full visibility into all OpenClaw agents directly in Mission Control. Users should see every agent, their models, cron schedulers, and live activity — all in one dashboard.

## Data Source
All data comes from the OpenClaw Gateway API at `http://127.0.0.1:18789`:
- **Agents**: from `openclaw.json` config (already partially proxied via `/api/openclaw/`)
- **Cron jobs**: Gateway cron API
- **Sessions**: Gateway sessions API  
- **Config**: Gateway config API

Auth: Bearer token (already configured in MC's env as `OPENCLAW_GATEWAY_TOKEN`)

## Feature 1: Agent Registry (sync all agents from OpenClaw)

### API Routes
- `GET /api/openclaw/agents` — fetch all agents from gateway config
  - Returns: id, name, workspace, primary model, fallback models, channel bindings
  - Parse from gateway config.get response: `agents.list` + `agents.defaults` + `bindings`

### UI: AgentsSidebar Enhancement
Current sidebar shows MC-local agents. Enhance to show ALL OpenClaw agents:
- Show agent name, emoji, primary model (as badge)
- Show channel icons (Telegram 📱, Discord 💬) based on bindings
- Color-code by status: 🟢 active (has recent session), 🟡 idle, ⚫ no sessions
- Click → opens Agent Detail modal

### Agent Detail Modal
- **Info tab**: id, name, workspace path, channel bindings
- **Models tab**: primary model, fallback models, available models list
- **Schedulers tab**: list of cron jobs owned by this agent (see Feature 2)
- **Activity tab**: recent session history for this agent

## Feature 2: Scheduler Calendar View

### API Routes  
- `GET /api/openclaw/cron` — fetch all cron jobs from gateway
  - Returns: job id, name, agentId, schedule (cron/every/at), enabled, last run status, errors
  - Group by agentId for per-agent view

### UI: New "Schedulers" page/tab
Add a new section accessible from the header navigation.

#### Calendar View
- Weekly calendar grid showing when each cron fires
- Color by agent (each agent gets a color)
- Color intensity by status: green=ok, red=error, gray=disabled
- Hover shows: job name, schedule, last run time, last status

#### List View (toggle)
- Table: Job Name | Agent | Schedule | Model | Last Run | Status | Errors
- Sort by agent, status, or schedule
- Filter by agent
- Show error count badge for failing jobs
- Highlight jobs with `consecutiveErrors > 0` in red

### Per-Agent Scheduler Section
In the Agent Detail Modal → Schedulers tab:
- List all cron jobs for that agent
- Show schedule in human-readable format ("Every day at 8:00 AM Warsaw")
- Show last run status with timestamp
- Show error message if failing

## Feature 3: Model Dashboard

### API Route
- `GET /api/openclaw/models` — parse from gateway config
  - Returns per-agent: primary model, fallback models
  - Returns global: available models list with aliases, default model + fallbacks

### UI: Models section in Agent Detail + Overview
- In Agent Detail Modal → Models tab:
  - Primary model with provider badge
  - Fallback chain
  - Available models (from defaults.models)
- In AgentsSidebar: show model as small badge under agent name
- Optional: "Models Overview" card showing model distribution across agents

## Feature 4: Live Activity Feed

### API Routes
- `GET /api/openclaw/sessions/active` — fetch active sessions
  - Use sessions_list equivalent from gateway API
  - Returns: session key, agent id, kind (main/subagent/isolated), last message time, token usage
- SSE integration: poll every 10s for session changes

### UI Updates

#### Activity Log Enhancement  
Current `ActivityLog.tsx` shows MC events. Add OpenClaw activity:
- "[agent] responding in Telegram" (when session is active with telegram channel)
- "[agent] running cron job: Morning Brief" (when isolated session matches a cron)
- "[agent] idle" (when no recent activity)
- Real-time updates via SSE

#### Kanban Board Enhancement
In `MissionQueue.tsx`, add agent activity indicators:
- If an agent assigned to a task is currently active, show a pulsing 🟢 dot
- Show "Working now" badge on tasks where the assigned agent has an active session

#### Pixel Office Enhancement  
In `PixelOffice.tsx`, update agent avatars:
- Animate avatar when agent is active (pulsing border or typing indicator)
- Show what they're doing: "💬 Telegram", "⏰ Cron: Morning Brief", "🔧 Sub-agent task"
- Gray out when idle/offline

## Implementation Notes

### Gateway API Calls
The gateway runs on `ws://127.0.0.1:18789` but also exposes HTTP endpoints.
For REST calls, use the chat completions endpoint pattern or direct WebSocket RPC.

Existing code in `src/lib/openclaw/client.ts` has WebSocket client — extend it.
Existing proxy at `src/app/api/openclaw/` — add new sub-routes.

### Polling Strategy
- Agents + Models: fetch on page load, cache for 5 min
- Cron jobs: fetch on page load, refresh every 60s  
- Active sessions: poll every 10s for live activity
- Use SSE to push changes to frontend

### Database
No new MongoDB collections needed — all data comes from OpenClaw gateway in real-time.
Optionally cache agent snapshots for historical tracking (existing `AgentSnapshot` model).

## Tech Stack (existing)
- Next.js 14 App Router
- React 18 + TypeScript 5
- Tailwind CSS (mc-* dark theme)
- Zustand v5 for state
- MongoDB + Mongoose
- SSE for real-time updates
