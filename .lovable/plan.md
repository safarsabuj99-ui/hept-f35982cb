## Goal

Transform the current 1-shot "research → draft" flow into a **smart, multi-step AI campaign agent** that researches deeper, learns from this client's historical performance, self-critiques its own draft, recommends budget/bidding intelligently, and lets you chat with it to refine — across Meta, TikTok and Google.

## What changes for the user

1. **One smarter "Generate" run** that internally goes through 5 stages with progress:
   `Scrape → Learn from past → Strategize → Draft → Self-critique & refine`
2. **Past-performance panel** — shows top 3 winning angles, best audiences, avg ROAS / CPA from this client's actual `campaigns` + `campaign_performance` data, used as grounding.
3. **Smart Budget card** — recommended daily budget, bid strategy, scaling plan, derived from client wallet balance + objective + historical CPA. Editable.
4. **Critique badge** on the draft — shows what the AI improved in the refine pass ("strengthened hooks", "narrowed audience to age 25-40 based on past wins").
5. **Chat-to-refine sidebar** — free-text chat: "make audience younger", "add a discount angle", "rewrite hooks more aggressive", "split-test 2 budgets". AI returns a new version (uses existing `ai_campaign_draft_versions` history).
6. **Platform-aware output** — same agent but the prompt/tool schema branches for Meta vs TikTok (hook-first, native formats, Spark Ads) vs Google (Search + PMax structure, keyword themes, asset groups).

## Technical design

### New / changed edge functions

- `ai-campaign-agent` (new, **replaces orchestration**) — single entry point that runs the staged loop and streams status into the draft row. Internal stages:
  1. **Scrape stage** — if `product_url` is set, call Firecrawl `/scrape` (formats: `markdown`, `summary`, `branding`) to ground research in real product copy, price, brand colors/logo. Skip silently on failure.
  2. **History stage** — query this client's past campaigns:
     ```
     campaigns (client_id, objective, name) 
     ⨝ campaign_performance (spend, results, ctr, cpa, roas, last 90d)
     ```
     Aggregate top angles (parse from `name`/`mapping_keyword`), best age/gender, avg CPA per objective. Pass as `past_performance_json` to the model.
  3. **Strategy stage** — Lovable AI `google/gemini-2.5-pro` produces a structured "strategy brief" (target persona, 3 angles, recommended budget range, bidding) using research + past performance + wallet balance.
  4. **Draft stage** — current `submit_campaign` tool call, but with strategy as grounding and **platform-specific tool schema** (see below).
  5. **Critique & refine stage** — second LLM pass: model receives its own draft + a "senior media buyer reviewer" system prompt + a `submit_critique_and_revision` tool returning `{ issues_found: string[], revised_tree }`. Save both the issues and the revised tree.
- `ai-campaign-refine` (new) — handles chat refinement. Input: `{ draft_id, instruction }`. Loads current draft + history, calls model with a `revise_draft` tool, writes new version + change_note = instruction. Drives the chat sidebar.
- `ai-campaign-research` and `ai-campaign-generate` — kept for now, marked deprecated; the new agent supersedes them. UI calls only `ai-campaign-agent`.

### Platform-specific tool schema (Meta / TikTok / Google)

`ai-campaign-agent` picks one of three tool-call schemas based on the selected ad account's `platform_name`:

- **Meta** — current schema (Campaign → AdSet → Ads with primary_texts, headlines, placements, CTA).
- **TikTok** — Campaign → Ad Group → Ads with **hook-first script**, `video_concept`, `caption`, `cta`, `interest_categories`, `creator_persona` (Spark Ad style), placements limited to TikTok-native.
- **Google** — Either **Search campaign** (Ad Groups with keyword themes, 15 headlines / 4 descriptions / sitelinks) or **Performance Max** (Asset Group with headlines, long headlines, descriptions, image briefs, audience signal).
  - Decided by `objective`: `SALES`/`LEADS` with no URL → Search default; with URL → PMax.

Tree storage stays in `draft_json`; UI renders the right tree shape per `draft.platform`.

### Smart budgeting

In the strategy stage, model receives:
- Client's current wallet balance (`profiles` / `account_balances`).
- Past avg CPA for this `objective` from history stage.
- Account currency.

It outputs `recommended_budget: { daily, total_cap, bid_strategy, scaling_rule }` saved to `draft_json.budget_plan`. UI shows a Smart Budget card with editable daily budget that writes back to `draft_json.campaign.daily_budget`.

### Database

Single small migration on `ai_campaign_drafts`:
- `agent_stage TEXT` — current stage label for live progress (`scraping`, `learning`, `strategizing`, `drafting`, `critiquing`, `ready`).
- `agent_log JSONB DEFAULT '[]'` — append-only stage timeline `{ stage, started_at, finished_at, summary }`.
- `past_performance_json JSONB` — cached history-stage output.
- `strategy_json JSONB` — strategy-stage output (personas, angles, budget recommendation, critique notes).

No new tables. Reuses `ai_campaign_draft_versions` for chat-refine version history.

### Frontend (`src/pages/AICampaignBuilder.tsx`)

- Replace `startMutation` → calls `ai-campaign-agent`. Poll same draft row; render a **5-step progress stepper** driven by `agent_stage` and `agent_log`.
- New panels in the draft view:
  - `<PastPerformancePanel>` — top angles, audiences, CPA/ROAS, "what we learned from this client".
  - `<StrategyPanel>` — personas, angles, **Smart Budget card** (editable).
  - `<CritiquePanel>` — collapsible "AI self-review" with issues found and what changed.
  - `<RefineChat>` — sidebar chat → invokes `ai-campaign-refine`; messages stored in `ai_messages` scoped to a synthetic thread `aicb:<draft_id>`.
- Draft tree renderer split into `<MetaTree>`, `<TikTokTree>`, `<GoogleTree>` (selected by `draft.platform`).

### Firecrawl connector

Used only inside `ai-campaign-agent` Scrape stage with `FIRECRAWL_API_KEY`. If the connector isn't connected, the stage is skipped (not an error) and the agent logs "URL scraping unavailable — connect Firecrawl for deeper research."

### Out of scope (per your answer)

- No auto-publish to ad platforms — output stays as a reviewable plan.
- No AI image generation in this iteration.

## Open items I'll need from you during build

- Confirm Firecrawl is OK to connect (one-click connector, no key needed from you). If not, the Scrape stage is simply skipped.
- For TikTok / Google, the first version targets *plan quality* (structure + copy). Existing Meta publisher remains; TikTok / Google publishers are out of scope for this PR.
