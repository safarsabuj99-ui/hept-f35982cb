# AI Growth Copilot for Agencies

A powerful in-app AI assistant that helps agency admins/managers grow profit, analyze campaigns, write ad copy, and communicate with clients — powered by **OpenAI, Claude, or Gemini** using the agency's own API keys, with Lovable AI as a free fallback.

## Core idea

One unified "AI Copilot" surface with **four modes**, sharing a single chat engine + tool layer:

| Mode | What it does |
|---|---|
| **Campaign Analyst** | Analyzes any client's campaigns, finds winners/losers, recommends actions, generates one-click deep reports |
| **Growth Coach** | Open chat — ask anything about agency pricing, scaling, client acquisition, retention, hiring |
| **Ad Copy Generator** | Bangla/English ad copy, hooks, headlines, CTAs tuned per client niche & objective |
| **Client Communication** | Drafts client reports, follow-up emails, WhatsApp updates, performance recaps in your tone |

All four live in one route `/admin/ai-copilot` with a mode switcher. One conversation can fluidly move between modes.

## Provider system (BYO Keys)

**Per-agency keys** — agency owner adds one set of keys in Settings → AI Providers; whole team uses them.

Supported:
- **OpenAI** (GPT-5, GPT-4o, GPT-4o-mini)
- **Anthropic Claude** (Sonnet 4.5, Opus 4, Haiku)
- **Google Gemini** (2.5 Pro, 2.5 Flash) — *also supports Google OAuth sign-in (uses your Google account quota via OAuth token) as an alternative to pasting an API key*
- **Lovable AI** (built-in fallback — no key needed, works out of the box)

User picks the default provider + model per mode in settings. Per-message override available in chat ("ask with Claude Opus instead").

**Note on OAuth:** OpenAI and Anthropic don't offer consumer login for API access — only API keys. Only Gemini supports Google OAuth for API access. The UI will reflect this clearly.

## Where it lives

- **New main route:** `/admin/ai-copilot` (sidebar item with sparkle/brain icon, Admin + Manager only)
- **Floating "Ask AI" button** on Client Detail, Campaign Hub, Finance Hub — opens copilot pre-scoped to that context
- **Dashboard widget:** "Today's AI insights" — top 3 auto-generated alerts (nightly cron)
- **Settings tab:** `/admin/settings` → new "AI Providers" tab to manage keys, default models, usage caps

## How AI gets real data (Tools)

The AI never sees raw DB dumps. It calls **typed tools** that return pre-aggregated, clean JSON:

- `get_client_summary(client_id, date_range)` — spend, revenue, profit, ROAS, top campaigns
- `get_campaign_breakdown(client_id, date_range)` — per-campaign metrics with winner/loser tags
- `list_loss_making_campaigns(threshold)` — flagged underperformers
- `get_agency_pnl(date_range)` — overall agency profit/loss
- `get_client_wallet(client_id)` — balance + recent transactions
- `search_clients(query)` — fuzzy client lookup

All tools enforce **org isolation** via `get_user_org_id` — AI can never see another agency's data, even if prompt-injected.

## Deep Reports (one-click)

In Campaign Analyst mode: pick client + date range → "Generate Report" → AI produces:
- Executive summary (3–5 bullets)
- Winners table with profit + reason
- Losers table with root cause (high CPM / low CTR / weak conversion / wrong objective)
- "You wasted $X" headline figure
- Ranked recommendations with severity (Pause / Scale / Reallocate / Fix Creative) — each cites the metric that drove it
- Risk flags (frequency fatigue, sudden CPM spike, account-level issues)

Reports are saved to DB → re-openable, exportable to PDF, shareable. Same range = cached (free + instant).

## Conversation features

- **Persistent threads** per user (database-backed, scoped to user + org)
- **Streaming responses** with markdown rendering
- **Tool call accordion** — see what the AI fetched and why
- **Quick prompts** per mode ("Find my worst-performing client", "Write a follow-up to Rafin about his August report", "Bangla ad copy for fashion sale")
- **Context chips** — attach a client/campaign to ground the conversation
- **Slash commands** — `/report <client>`, `/copy <product>`, `/email <client>`

## Database (new)

- `ai_provider_configs` — org_id, provider (openai/anthropic/gemini), encrypted_api_key, oauth_token (nullable), default_models JSONB, monthly_budget_usd, usage_this_month
- `ai_threads` — id, org_id, user_id, title, mode, context_client_id (nullable), updated_at
- `ai_messages` — thread_id, role, parts JSONB (AI SDK UIMessage format), tool_calls, token_count, cost_usd
- `ai_reports` — client_id, org_id, date_from, date_to, provider, model, payload JSONB, created_by
- `ai_usage_log` — org_id, user_id, provider, model, tokens_in, tokens_out, cost_usd, created_at (for monthly budget enforcement)

All org-scoped via RLS. API keys encrypted at rest via Supabase vault.

## Edge functions (new)

1. `ai-copilot-chat` — streaming chat with Vercel AI SDK, supports OpenAI/Anthropic/Gemini/Lovable, executes tools, persists messages, logs usage
2. `ai-generate-report` — Campaign deep report with structured Zod output
3. `ai-tools-runtime` — Server-side tool execution layer (aggregations, queries — never raw SQL from AI)
4. `ai-nightly-insights` — pg_cron-scheduled; pre-computes top alerts per client for dashboard widget
5. `ai-provider-test` — Validates an API key works before saving

## Security

- API keys encrypted with Supabase vault, never returned to frontend
- Tool layer enforces `org_id = get_user_org_id(auth.uid())` on every query
- Prompt injection guard: tools validate `client_id` belongs to caller's org before returning data
- Monthly USD budget cap per org — blocks new calls when exceeded
- Audit log entry for every AI report generation & provider key change
- New permission flag `can_use_ai_copilot` in existing 13-flag system

## UI / Design

- Premium glassmorphism matching existing design system (`ios-glass`, `blur(40px)`, glow-borders)
- AI Elements components (Conversation, Message, PromptInput, Tool accordion, Shimmer loader)
- Mode switcher: pill tabs at top (Analyst / Coach / Copy / Comms)
- Right rail: provider/model selector, usage meter, context chips
- Mobile-first: full-screen chat, bottom prompt input

## Phasing

**Phase 1 — Foundation (ship first)**
- AI Providers settings tab (add OpenAI/Claude/Gemini keys, test, set default)
- `/admin/ai-copilot` chat shell with Lovable AI fallback
- Growth Coach mode (open chat, no tools yet)
- Database tables + permissions + RLS

**Phase 2 — Campaign intelligence**
- Tools layer (`get_client_summary`, `get_campaign_breakdown`, `list_loss_making_campaigns`, etc.)
- Campaign Analyst mode with tool calling
- Deep Reports (one-click, saved, exportable)
- "Ask AI" buttons on Client Detail & Campaign Hub

**Phase 3 — Creative & comms**
- Ad Copy Generator mode (Bangla + English templates per niche)
- Client Communication mode (email/WhatsApp draft generator, learns your tone)
- Slash commands

**Phase 4 — Automation**
- Nightly auto-insights cron
- Dashboard "Today's AI insights" widget
- Weekly AI digest email to admins
- Gemini OAuth sign-in option (alternative to pasting Gemini key)

## Out of scope (this plan)

- Client-facing AI (admin/manager only)
- Auto-executing AI recommendations — always human-in-the-loop with "Apply" buttons
- Fine-tuning custom models
- Voice input/output

---

**Approve to start with Phase 1** (Foundation: provider settings + chat shell + Growth Coach), or tell me to bundle Phase 1+2 together for a bigger first ship.
