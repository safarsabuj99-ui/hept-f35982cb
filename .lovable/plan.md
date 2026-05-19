# Nova v3 — "Operator-grade" agentic AI

Turn Nova from a read-only chat assistant into an **autonomous operator** that plans, remembers, acts (with approval), and runs on a schedule. Built on the AI SDK + Lovable AI Gateway with a deferred meta-tool registry so the tool catalog can grow without inflating context.

## What changes from today

Today Nova has 13 read-only tools, a single-shot streamed reply, no memory across threads, no actions, no schedule. After this upgrade:

- **Plan → Act → Reflect loop** with self-critique and `stopWhen(stepCountIs(50))`
- **Tool deferral** via `tool_search` + `tool_invoke` (meta-tools) so 40+ tools cost ~0 context
- **Persistent agent memory** per agency + per client (facts, preferences, do/don't list)
- **Action tools with approval** — pause campaign, top-up draft, client message, expense entry, reallocate budget
- **Vision** — drop a screenshot of a campaign / dashboard / creative; Nova reads it
- **Scheduled missions** — "every morning 9am: scan yesterday's spend, draft a brief for me" delivered via in-app notification + persisted thread
- **Proactive watchers** — ad guard / fatigue / runway anomalies open a Nova thread automatically with a recommended action
- **Rich result cards** in chat — KPI tiles, mini bar/line charts, campaign tables, client cards, with one-click "Apply"
- **Migrate provider layer to AI SDK** (`@ai-sdk/openai-compatible` + `streamText` + `tool()`) — replaces 200 lines of hand-rolled OpenAI/Anthropic/Gemini glue with one path through Lovable AI Gateway. Keep BYO-key for OpenAI/Anthropic/Gemini as overrides.
- **Default provider hardened to Lovable AI** so the "No API key configured for anthropic" error class disappears unless the user explicitly opts in and has a key.

## Architecture

```text
                    ┌──────────────────────────────────────────┐
                    │   AICopilot UI  (3-pane: threads | chat  │
                    │   | inspector with plan/tools/memory)    │
                    └──────────────────┬───────────────────────┘
                                       │ useChat (AI SDK UI)
                                       ▼
                    ┌──────────────────────────────────────────┐
                    │   edge fn: ai-copilot-chat               │
                    │   streamText + meta-tools                │
                    │   ├── eager: plan, remember, finish      │
                    │   └── deferred: tool_search/tool_invoke  │
                    │            └─► tool registry (40+)       │
                    │                ├─ read tools (current 13)│
                    │                ├─ diagnostic+ (new)      │
                    │                ├─ action tools (approval)│
                    │                └─ memory tools           │
                    └──────────────────┬───────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
  ai_agent_memory             ai_scheduled_missions          ai_pending_actions
  (per org/client/user)       (cron, mode, prompt)           (proposed mutation +
                                                              approval state)
                                       │
                                       ▼
                    ┌──────────────────────────────────────────┐
                    │ edge fn: ai-mission-runner (pg_cron 5m)  │
                    │ - reads due missions                     │
                    │ - runs Nova non-interactively            │
                    │ - posts result into a thread + notif     │
                    └──────────────────────────────────────────┘
```

## Backend changes

### New tables (migration)

- `ai_agent_memory` — `{ id, org_id, scope ('agency'|'client'|'user'), scope_id, key, value, source ('user'|'agent'), updated_at }`. RLS via `get_user_org_id`. Indexed `(org_id, scope, scope_id)`.
- `ai_scheduled_missions` — `{ id, org_id, user_id, title, prompt, mode, cron, enabled, last_run_at, next_run_at, notify }`. RLS owner.
- `ai_pending_actions` — `{ id, org_id, user_id, thread_id, message_id, tool_name, args, summary, status ('pending'|'approved'|'rejected'|'executed'|'failed'), result, created_at, decided_at }`. RLS owner.
- Realtime added to `ai_messages`, `ai_pending_actions`.

### New edge function: `ai-mission-runner`
Invoked by pg_cron every 5 min. Loads due missions, opens/reuses a thread, runs Nova with the mission prompt non-interactively, persists the assistant turn, fires a push notification with a deep-link to the thread.

### Rewrite of `ai-copilot-chat`
- Migrate to `streamText` + AI SDK `tool()` schemas (Zod), provider via `createLovableAiGatewayProvider`.
- Default model: `google/gemini-3-flash-preview`; explicit override via UI.
- Force `provider="lovable"` when the requested provider has no configured key (fixes today's "No API key for anthropic" 400) and surface a non-blocking toast.
- `stopWhen: stepCountIs(50)`.
- System prompt adds the planner contract and points the model at meta-tools, not the full catalog.
- Eager tools: `plan` (writes a step list to the inspector), `remember` / `recall` (memory), `finish`. Everything else goes through `tool_search` / `tool_invoke`.
- Action tools (pause_campaign, draft_topup, draft_client_message, log_expense, reallocate_budget) call `needsApproval: true` — the executor inserts an `ai_pending_actions` row and streams a `pending_action` part. User approves in the UI → a separate `ai-action-execute` edge function performs the real mutation (reusing existing helpers like `adjustAccountBalance`, the `pause-campaign` function, etc.).
- Vision: accept image parts (data URL or storage path) and forward to Gemini multimodal.

### Tool registry expansion (incremental, all read-only first then action)

Read/diagnostic additions (12+):
- `forecast_client_spend(client_id, horizon)` — linear/EMA forecast
- `detect_anomalies(scope, window)` — z-score on spend/CTR/CPM
- `compare_clients(ids[])` — side-by-side table
- `get_audience_overlap(campaigns[])` — placeholder until Meta insights wired
- `get_creative_inventory(client_id)` — last 30d distinct ads + status
- `get_payment_history(client_id)`
- `get_wallet_runway_all()` — every client at once for the morning brief
- `search_messages(query)` — semantic over prior Nova threads (pgvector, phase 2)
- `get_org_kpis(window)` — agency-level rollup
- `get_team_workload()` — campaigns per manager
- `get_ad_account_health()` — guard/freeze/refresh state
- `get_currency_rate(from,to,date)`

Action tools (5, all `needsApproval`):
- `pause_campaign(campaign_id, reason)`
- `draft_topup(client_id, amount_bdt, note)` — creates a Payment Request draft
- `draft_client_message(client_id, channel, body)` — pushes to outbox
- `log_expense(amount_bdt, category, note)`
- `reallocate_budget(from_campaign, to_campaign, amount_usd, reason)` — drafts an internal note

## Frontend changes

### `src/pages/AICopilot.tsx` — 3-pane workspace
- **Left rail (240px):** thread list (existing) + a "Missions" section listing scheduled missions with on/off toggle and "Run now".
- **Center:** chat. Switch the message renderer to render `parts[]` properly:
  - text parts → markdown (react-markdown is already in tree where used)
  - `tool_call` + `tool_result` → collapsible card with domain-specific render (`get_creative_fatigue` → fatigue gauge; `list_top_clients_by_spend` → mini bar; `get_funnel_health` → funnel; `get_agency_pnl` → KPI strip; generic → JSON viewer).
  - `pending_action` → inline action card with summary + Approve / Reject buttons (calls `ai-action-execute`).
- **Right inspector (320px, collapsible):** three tabs
  - **Plan** — the live step list emitted by the `plan` tool, with checkmarks as steps complete
  - **Tools** — chronological tool log with latency + status
  - **Memory** — agency/client memory cards, editable

### New routes / components
- `/admin/ai-copilot` → workspace above (existing route, redesigned)
- `/admin/ai-copilot/missions` → CRUD for scheduled missions (title, prompt, mode, cron picker, notify on/off)
- `ai/PendingActionCard.tsx`, `ai/ToolResultCard.tsx`, `ai/PlanPanel.tsx`, `ai/MemoryPanel.tsx`, `ai/MissionList.tsx`

### Proactive triggers (light touch)
- When `ad-guard-check`, `billing-radar`, or `revenue-forecast` raise a critical event, insert a Nova thread seeded with the event + a `mode='analyst'` prompt and send a push notification "Nova has a recommendation for client X". User clicks → lands in the thread, agent already finished its diagnose.

## Implementation order

1. **Stabilise today** — default provider to Lovable when the chosen one has no key (silences the runtime error).
2. **Migration** — `ai_agent_memory`, `ai_scheduled_missions`, `ai_pending_actions` + RLS + realtime.
3. **Edge fn rewrite** — AI SDK + meta-tools + planner contract + memory tools. Keep current 13 tools working, add the 12 new read tools, add the 5 action tools with `needsApproval`.
4. **Frontend message renderer** — `parts[]`, tool result cards, pending-action cards. Keep existing slash commands.
5. **3-pane layout** — plan / tools / memory inspector.
6. **`ai-action-execute` edge fn** — approve/reject endpoint mapping each action tool to its real mutation.
7. **Missions** — UI + `ai-mission-runner` edge fn + pg_cron schedule (every 5 min).
8. **Proactive Nova threads** wired from ad-guard / billing-radar.

## Technical notes

- AI SDK on Deno: `import { streamText, tool, stepCountIs } from "npm:ai"` + `npm:@ai-sdk/openai-compatible` + `npm:zod`.
- Provider helper goes in `supabase/functions/_shared/ai-gateway.ts` with the required `Lovable-API-Key` and `X-Lovable-AIG-SDK: vercel-ai-sdk` headers.
- Frontend uses AI SDK `useChat` with `DefaultChatTransport` pointed at the edge function URL; auth header carries the Supabase session token. We keep the existing ndjson fallback in a code branch for one release in case streamText shape needs tuning, then remove.
- All action mutations stay in the existing edge functions (`pause-campaign`, payment-request creation, etc.) — Nova only drafts and the approval step calls them.
- Memory writes are gated: `remember` tool requires `scope`, `key`, `value`; reads are cheap (single indexed query).
- Tool deferral pattern matches the AI SDK guidance: `tool_search({ query, server?, limit })` and `tool_invoke({ name, arguments })` are the only "operator" tools the model sees besides `plan`, `remember`, `recall`, `finish`.

## Out of scope (next phase)

- pgvector semantic memory over chat history (planned in phase 2)
- Direct MCP connector integration for Notion / Linear / Sheets
- Multi-agent (router → specialist subagents)
- Voice in/out

Approve and I'll ship in the order above, pausing after step 4 for a checkpoint so you can sanity-check the rewritten chat surface before the action/mission pieces land.