# AI Copilot v2 — The Agency Growth Operator

Transform the current AI Copilot into a **specialist digital-marketing operator** that thinks like a senior media buyer + account strategist, not a generic chatbot. Two tracks: **brain upgrade** (smarter agent) + **workspace redesign** (purpose-built UI for marketers).

---

## Track 1 — Brain: from "chat with tools" to "marketing operator"

### 1.1 Domain-trained system prompt (Persona: "Nova, Growth Operator")
Replace the generic prompt with a **role-locked persona** that:
- Thinks in marketer language: ROAS, CAC, CPM, CPC, CTR, CVR, frequency, creative fatigue, funnel stages, audience saturation, attribution windows, MER, LTV/CAC.
- Always asks: *what's the goal, what's the constraint, what's the next action?* — never answers without a recommendation.
- Speaks bilingual BD context (Bangla + English), uses BDT for billing/revenue and USD for ad spend (matches project memory).
- Outputs in a fixed **Diagnose → Insight → Action** format with confidence + a next-step proposal.

### 1.2 Reasoning upgrade — Planner / Executor / Critic loop
Today: single LLM loops tools. Upgrade to a 3-role internal pipeline (still one streamed conversation):
- **Planner (Pro model)** — breaks the goal into a numbered investigation plan, picks tools.
- **Executor (Flash)** — runs the tool calls cheaply.
- **Critic (Pro)** — reviews results, catches gaps ("you didn't check frequency"), asks for one more tool call, then writes the final answer.
This raises answer quality without raising cost, because expensive thinking only runs at plan + critique time.

### 1.3 Expanded tool registry (the marketing toolbelt)
Add ~15 tools on top of Phase 2A's 9 reads. Grouped by job-to-be-done:

**Diagnose performance**
- `get_creative_fatigue(campaign_id, range)` — CTR/CPM trend slope, frequency band, recommends refresh.
- `get_funnel_health(client_id, range)` — impressions → clicks → leads → purchases drop-off + bottleneck flag.
- `get_attribution_breakdown(client_id, range)` — platform mix vs revenue mix.
- `detect_budget_pacing(client_id)` — over/under-pacing vs daily target.
- `benchmark_against_agency(campaign_id)` — % vs agency median ROAS/CPM for same objective.

**Money + risk**
- `get_runway_forecast(client_id)` — days until balance burns out at current pace.
- `get_unbilled_spend(client_id)` — gap between ad spend and recorded revenue.
- `get_loss_leak_summary(range)` — total $ wasted on campaigns with 0 results, by client.

**Creative + growth**
- `generate_ad_copy_variants(brief, lang, count)` — Bangla/English hook+body+CTA sets, RTB-grounded.
- `suggest_audience_angles(client_id)` — based on winning campaigns' targeting patterns.
- `draft_optimization_brief(campaign_id)` — structured "pause/scale/refresh/retarget" recommendation.
- `propose_weekly_plan(client_id)` — next 7 days action list with KPIs.

**Comms (drafts, never auto-send)**
- `draft_client_update(client_id, range, tone)` — WhatsApp/email status report in client's language.
- `draft_topup_reminder(client_id)` — bilingual, ties to runway forecast.
- `draft_pitch_for_new_service(client_id)` — upsell angle from data.

All tools stay org-scoped via `get_user_org_id`. Write tools (drafts, proposals) flow through Phase 2B's approval cards.

### 1.4 Memory + grounding
- `ai_memory` table (per org) — Nova remembers: client niches, preferred tone, KPI thresholds, naming conventions, past decisions ("we paused Rafin's video ads because frequency hit 6").
- Auto-grounded context — when the user is on `/admin/clients/:id`, the active client + date range are auto-attached as context chips, so Nova never asks "which client?"
- Slash commands as power-user shortcuts: `/audit`, `/leaks`, `/winners`, `/runway`, `/copy`, `/update <client>`, `/plan <client>`.

### 1.5 Quick-action workflows (one-click agentic runs)
Empty-state grid of pre-built operator workflows:
1. **Weekly agency audit** — scans every active client, finds top 3 leaks + top 3 winners, drafts an action list.
2. **Find money leaks now** — loss-making campaigns this week with proposed pauses.
3. **Runway risk sweep** — clients ≤7 days of balance + bilingual top-up reminders.
4. **Creative refresh radar** — campaigns with fatigue signals + new copy variants.
5. **Client check-in batch** — draft status updates for every client with activity this week.
6. **Reactivate dormant clients** — clients with no spend in 30d + tailored re-engagement pitch.

---

## Track 2 — Workspace: redesign for marketers (not generic chat)

Current page is a chat with a sidebar. Replace with a **3-pane Operator Workspace**.

```text
┌────────────┬───────────────────────────────────┬──────────────┐
│ THREADS    │   CONVERSATION + STEP TIMELINE    │  CONTEXT     │
│ + Quick    │   ─ Plan card                     │  • Active    │
│   Actions  │   ─ Tool cards (collapsed)        │    client    │
│ + Recent   │   ─ Insight cards (charts/KPIs)   │  • Date range│
│   reports  │   ─ Proposal cards (Apply/Reject) │  • Model     │
│            │   ─ Final answer (markdown)       │  • Step #    │
│            │                                   │  • Cost $    │
│            │   [ slash-command composer ]      │  • Memory    │
└────────────┴───────────────────────────────────┴──────────────┘
```

### 2.1 Empty state = the launch pad
Not "hi, how can I help?" — a **mission console**:
- 6 quick-action workflow cards (above).
- Top row: live KPI strip (today's spend, ROAS, low-balance clients, leaks $) so Nova feels embedded in the agency.
- Bottom: 3 suggested questions generated from real account state ("Rafin's CPM doubled this week — investigate?").

### 2.2 Conversation surface (AI Elements)
Install AI Elements primitives (`conversation`, `message`, `prompt-input`, `tool`, `shimmer`) instead of the current hand-rolled chat. Built-in spec-compliant streaming, tool accordions, and shimmer "Thinking…" state.

### 2.3 Rich, marketing-native message parts
Beyond text + tool JSON, render:
- **KPI card** — for metric answers (big number + delta + sparkline).
- **Table card** — for client/campaign lists with sortable columns.
- **Chart card** — sparklines for trend tools (Recharts).
- **Diagnosis card** — color-coded Diagnose / Insight / Action blocks.
- **Proposal card** — preview + Apply / Edit / Reject (Phase 2B).
- **Copy card** — ad copy variants with copy-to-clipboard per variant.

### 2.4 Right-rail context inspector
- Active context chips (client / campaign / date range) — removable.
- Provider + model picker (Pro / Flash / Claude / GPT-5) with cost hint.
- Live step counter + cumulative token + USD cost for this run.
- Memory inspector — list of facts Nova remembers about this org, editable.

### 2.5 Embedded "Ask Nova" everywhere
Floating button on Client Detail, Campaign Hub, Finance Hub — opens a slide-over copilot pre-scoped with the page's context chip. The agent feels like it lives *inside* the workflow, not in a separate tab.

### 2.6 Visual language
Match project memory (glassmorphism, `ios-glass`, blur(40px), glow borders, BDT ৳ / USD $ formatting). New accent: a subtle "agent active" glow on the composer while the loop runs. Step timeline uses thin vertical rail with status dots (planning → tool → result → answer).

---

## Phasing

**Phase A — Brain v2 (ship first)**
- New persona system prompt + Diagnose/Insight/Action output contract.
- Planner/Executor/Critic pipeline in `ai-copilot-chat`.
- 8 highest-leverage new read tools (fatigue, funnel, runway, leaks, benchmark, pacing, attribution, unbilled).
- Auto-context injection from route.

**Phase B — Workspace redesign**
- AI Elements install + 3-pane layout.
- KPI / Table / Chart / Diagnosis message renderers.
- Right-rail inspector + step/cost meter.
- Empty-state mission console + 6 quick-action workflows.

**Phase C — Memory + write proposals**
- `ai_memory` table + remember/recall tools.
- Phase 2B write tools + Apply/Reject proposal cards.
- Floating "Ask Nova" on Client Detail / Campaign Hub / Finance Hub.

**Phase D — Background operator** (optional, after C)
- `pg_cron` nightly run → "Today's AI insights" dashboard widget + weekly digest email.

---

## Out of scope
- Auto-execute mutations (always human-approved).
- Client-facing chatbot.
- Voice I/O / fine-tuning.

---

**Approve to start Phase A (brain v2)**, or say *"A+B together"* to ship the smarter agent inside the new workspace in one go.
