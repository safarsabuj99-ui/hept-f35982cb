# AI Growth Copilot → Fully Agentic AI System

Upgrade the existing Phase 1 chat shell into a **true agentic AI** that doesn't just answer questions — it **investigates, plans, executes multi-step actions, and proposes changes** across your agency data (with human approval for anything that mutates state).

## What "agentic" means here

Today: user asks → AI replies with text.
After: user states a goal → AI **plans steps → calls tools → reads results → calls more tools → reasons → proposes/executes actions → reports back** — autonomously, in a loop, with streaming progress visible to you.

Example goals it will handle end-to-end:
- *"Audit all my clients this month, find the 3 worst campaigns, draft a pause recommendation + client email for each."*
- *"Find which clients are about to run out of balance and draft top-up reminders in Bangla."*
- *"Compare last 7 days vs previous 7 days across all clients, surface anomalies, and create a deep report for the worst."*
- *"Write 5 Bangla ad copy variants for Rafin's fashion campaign, then save them as a campaign request."*

## Core architecture (AI SDK agent loop)

```text
┌──────────────────────────────────────────────────┐
│  User goal                                       │
│        ↓                                         │
│  Planner step (LLM)  →  decides next action      │
│        ↓                                         │
│  Tool call  →  ai-tools-runtime executes         │
│        ↓                                         │
│  Tool result  →  fed back to model               │
│        ↓                                         │
│  Reflect → next tool OR final answer             │
│  (loop up to 50 steps, stopWhen)                 │
└──────────────────────────────────────────────────┘
```

Built on **Vercel AI SDK** `streamText` + `tool()` + `stopWhen: stepCountIs(50)`, streamed to a Conversation UI that renders each step (thinking / tool call / tool result / proposal).

## The tool layer (the agent's "hands")

All tools enforce `org_id = get_user_org_id(auth.uid())`. Two categories:

**Read tools (auto-execute, no approval)**
- `search_clients(query)` · `get_client_summary(client_id, range)` · `get_campaign_breakdown(client_id, range)`
- `list_loss_making_campaigns(threshold, range)` · `list_winning_campaigns(min_roas, range)`
- `get_agency_pnl(range)` · `get_client_wallet(client_id)` · `get_low_balance_clients(threshold)`
- `compare_periods(range_a, range_b, scope)` · `detect_anomalies(client_id, range)`
- `get_campaign_metrics_timeseries(campaign_id, range)` · `list_clients_needing_attention()`
- `get_ad_creative(campaign_id)` · `web_search(query)` (Lovable AI grounded)

**Write tools (require human approval via `needsApproval`)**
- `propose_pause_campaign(campaign_id, reason)` — shows Apply button → calls existing `pause-campaign` edge function
- `propose_campaign_request(client_id, payload)` — drafts in `campaign_requests` table as pending
- `draft_client_email(client_id, topic, language)` — saves to drafts, never auto-sends
- `draft_whatsapp_message(client_id, topic, language)` — copy-to-clipboard
- `save_ad_copy_variants(client_id, copies[])` — stored in new `ai_ad_copy_drafts` table
- `generate_deep_report(client_id, range)` — saves to `ai_reports`
- `create_internal_note(client_id, note)` — appended to client timeline

Every write tool returns a **proposal card** in chat with diff/preview + Apply/Reject buttons. Nothing mutates without your click.

## Agentic capabilities added on top of Phase 1

1. **Multi-step planning** — `stopWhen: stepCountIs(50)`, model sees its own tool results and decides what to do next.
2. **Streamed reasoning trace** — every tool call/result renders as an expandable accordion (AI Elements `Tool` component) so you see *what* the agent did and *why*.
3. **Approval gates** — `needsApproval` on all mutating tools; chat renders Apply / Edit / Reject buttons.
4. **Context chips** — attach a client / campaign / date range to ground the whole conversation; auto-injected into every tool call.
5. **Slash commands** — `/audit <client>`, `/report <client>`, `/copy <product>`, `/email <client>`, `/find losers`, `/find winners`.
6. **Quick-action launcher** — pre-built agentic workflows on the AI Copilot home: *"Weekly audit"*, *"Find money leaks"*, *"Draft client check-ins"*, *"Reactivate dormant clients"*.
7. **Background agents (Phase 4)** — `pg_cron` nightly runs `ai-nightly-agent` that produces *"Today's AI insights"* on the dashboard + weekly digest email.
8. **Memory** — per-org `ai_memory` table the agent can write to (`remember_fact`, `recall_facts` tools) so it learns your preferences, tone, client niches, naming conventions across sessions.
9. **Tool-use budget** — per-message max steps + per-org monthly USD budget enforced in `ai-copilot-chat` before each step.
10. **Multi-provider routing** — Planner uses **GPT-5 / Claude Sonnet 4.5 / Gemini 2.5 Pro** (your choice); cheap sub-tasks (summarize tool output, format) auto-route to **Flash / Haiku / 4o-mini** to cut cost ~70%.

## UI changes

- `/admin/ai-copilot` becomes an **agent workspace**:
  - Left: thread list (existing)
  - Center: streaming conversation with **step timeline** (Plan → Tool → Result → Proposal → Answer)
  - Right rail: active **context chips**, **provider/model**, **step counter**, **token/cost meter**, **memory inspector**
- **Proposal cards** inline in chat: preview of what will change + Apply/Reject
- **Quick-actions grid** on empty state (6 pre-built agentic workflows)
- Floating **"Ask AI"** button on Client Detail / Campaign Hub / Finance Hub — opens copilot pre-scoped with context chip already attached
- Dashboard widget: **"Today's AI insights"** (3 nightly-generated cards with Apply buttons)

## Database additions

- `ai_tool_calls` — `(message_id, tool_name, args JSONB, result JSONB, status, latency_ms, cost_usd)` — full audit trail of every agent action
- `ai_proposals` — `(thread_id, kind, payload JSONB, status: pending|applied|rejected, applied_at, applied_by)` — pending write actions
- `ai_memory` — `(org_id, key, value, embedding vector(1536), updated_at)` — long-term agent memory with semantic recall
- `ai_ad_copy_drafts` — saved ad copy variants
- `ai_scheduled_runs` — `(org_id, workflow, cron, last_run_at, last_result JSONB)` — background agent runs
- Extend `ai_messages.parts` JSONB to store AI SDK UIMessage parts (text, tool-call, tool-result, reasoning, proposal)

All org-scoped via RLS using `get_user_org_id`.

## Edge functions

- **`ai-copilot-chat`** (rewrite) — `streamText` with full tool registry, `stopWhen: stepCountIs(50)`, `toUIMessageStreamResponse({ originalMessages, onFinish })`, persists messages + tool calls + proposals
- **`ai-tools-runtime`** (new) — pure server-side tool executors (each tool a function, args validated with Zod, org-scoped queries)
- **`ai-apply-proposal`** (new) — executes a single approved proposal (pause campaign, send email, etc.); logs to audit trail
- **`ai-generate-report`** (new) — long-form report with structured Zod output
- **`ai-nightly-agent`** (new, cron) — runs the *daily audit* workflow per org, writes results to `ai_scheduled_runs` + creates dashboard insight cards
- **`ai-provider-test`** (exists) — kept

## Security

- Every tool validates `org_id` before reading/writing
- Prompt-injection guard: tool descriptions explicitly tell model it cannot escape org scope; tool implementations re-verify
- Write tools **always** require human Apply click (no auto-execute path, even for the agent)
- API keys encrypted at rest (Supabase vault)
- Per-org monthly USD cap blocks new agent runs when exceeded
- Audit log entry for every Apply
- New permission flags: `can_use_ai_copilot`, `can_approve_ai_proposals` (admin-only by default)

## Phasing

**Phase 2A — Agent loop + read tools** (ship first)
- Rewrite `ai-copilot-chat` with AI SDK tool loop + `stopWhen`
- Build `ai-tools-runtime` with the 13 read tools
- UI: streaming step timeline + tool accordions + context chips + slash commands
- `ai_tool_calls` table + audit trail

**Phase 2B — Write tools + proposals**
- 7 write tools with `needsApproval`
- `ai_proposals` table + Apply/Reject flow + `ai-apply-proposal` function
- Floating "Ask AI" buttons on Client Detail / Campaign Hub / Finance Hub

**Phase 3 — Memory + quick workflows**
- `ai_memory` + `remember_fact` / `recall_facts` tools (pgvector)
- 6 pre-built quick-action workflows
- Smart provider routing (cheap model for sub-tasks)

**Phase 4 — Background agents**
- `ai-nightly-agent` cron + dashboard "Today's AI insights" widget
- Weekly AI digest email
- `ai_scheduled_runs` UI

## Out of scope

- Fully autonomous mutations (write actions always require Apply click)
- Client-facing agent (admin/manager only)
- Fine-tuning / custom models
- Voice I/O

---

**Approve to start with Phase 2A** (agent loop + read tools + step timeline UI), or say *"bundle 2A+2B"* to ship the agent with write proposals in one go.