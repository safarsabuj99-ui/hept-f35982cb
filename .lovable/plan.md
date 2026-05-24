
# AI Campaign Architect — Plan

A new "AI Campaign Builder" that turns a product description into a fully structured, ready-to-launch campaign (Campaign → Ad Set → Ads), reviewed by a human, then published to the real ad account (Meta / TikTok / Google) only after explicit approval.

This becomes a true game-changer because the marketer goes from *"blank screen"* → *"approve & launch"* in under 2 minutes, while keeping full naming, attribution, and pricing rules of the agency intact.

---

## 1. End-to-End User Flow

```text
Step 1  Select Client            → loads keyword + pricing + attribution tags
Step 2  Select Ad Account        → Meta / TikTok / Google (filtered by client mapping)
Step 3  Brief the Product        → text + optional URL + optional image(s)
Step 4  AI Deep Research         → audience, angles, competitors, hooks
Step 5  AI Draft (Campaign+AdSet+Ads, auto-named via client keyword)
Step 6  Marketer reviews / edits / regenerates any block
Step 7  Approve  →  Pending Action queued
Step 8  Final confirm → Edge function publishes to ad account
Step 9  Auto-mapped into existing campaigns table (keyword + tag)
```

Nothing touches the live ad account before step 8.

---

## 2. Inputs the AI receives automatically

Pulled silently from existing tables — the marketer does *not* re-type any of this:

- `clients`: keyword, ad_account_filter_tag, original_name_tag, language, country, currency, pricing_config
- `ad_accounts`: platform, currency, timezone, account-level limits
- Historical winners: top 5 campaigns by ROAS for the same client (last 90d) as style reference
- Agency brand voice (from `organizations.branding` if present)

Marketer only provides: **product description + URL/image** (1 field).

---

## 3. AI Deep Research Stage (new edge function `ai-campaign-research`)

Uses Lovable AI Gateway (`google/gemini-2.5-pro` for reasoning, `gemini-3-flash` for speed tier).

Performs in parallel:
1. **Product extraction** — scrape product URL (or read image) → features, price, USP, target persona
2. **Audience synthesis** — demographics, interests, pain points, buying triggers
3. **Angle generation** — 5 distinct creative angles (problem/solution, social proof, FOMO, transformation, comparison)
4. **Competitor scan** — optional Perplexity/web search for "alternatives to {product}" → positioning gaps
5. **Platform-fit scoring** — which platform/placement fits best (e.g. TikTok = UGC short, Meta = carousel)

Output stored in `ai_campaign_drafts.research_json`.

---

## 4. AI Draft Stage (`ai-campaign-generate`)

Generates a complete tree using **tool-calling / structured output** (not free-text JSON):

```text
Campaign
├── Objective       (Sales | Leads | Traffic | Messages | Awareness)
├── Budget          (daily, in account currency, sane default from history)
├── Schedule        (start, optional end)
└── Ad Set ×N
    ├── Audience    (locations, age, gender, interests, custom audiences)
    ├── Placements  (auto / manual)
    ├── Optimization (Purchase / Lead / LP view…)
    └── Ads ×N
        ├── Format     (Single Image | Carousel | Video | Collection)
        ├── Primary text × 3 variants
        ├── Headline × 3 variants
        ├── Description
        ├── CTA
        ├── Destination URL (with auto-built UTM)
        └── Creative brief (or generated image via Lovable AI image model)
```

### Auto-Naming (the part the user asked for)
All names follow the agency's existing convention so they map automatically:

```text
Campaign : {client_keyword} | {objective} | {angle} | {YYMMDD}
Ad Set   : {client_keyword} | {audience_label} | {placement}
Ad       : {client_keyword} | {format} | {hook_short} | v{n}
```

`client_keyword` and `ad_account_filter_tag` are injected directly, so the moment the campaign appears via sync, the existing **Attribution Mapping** engine picks it up — zero manual mapping.

---

## 5. Human-in-the-Loop Review UI (`/ai-campaign-builder`)

Three-pane layout:

```text
┌─ Brief & Research ─┬─ Draft Tree ──────┬─ Live Preview ─┐
│ product input      │ Campaign          │ Ad rendered as │
│ research summary   │  └ AdSet          │ Meta/TikTok    │
│ angles (chips)     │     └ Ad 1..N     │ would show it  │
│ regenerate buttons │   inline edit     │                │
└────────────────────┴───────────────────┴────────────────┘
```

Per node:
- **Edit** any field inline
- **Regenerate** this node only (cheap, keeps siblings)
- **Diff vs previous version** (drafts are versioned)
- **Lint warnings** (text length, banned words per platform, missing URL, budget < platform min)

Bottom bar: `Save draft` · `Request client approval` · `Approve & Queue Publish`.

---

## 6. Approval & Publish

Reuse existing `ai_pending_actions` system (already in `ai-action-execute`):

- New `tool_name`: `campaign.publish_draft`
- `args`: `{ draft_id, ad_account_id, client_id }`
- Status flow: `pending → approved → executed | failed`
- Audit-logged automatically (org-isolated)

Publisher edge functions (one per platform, can ship Meta first):
- `publish-campaign-meta` → Marketing API: create campaign → adset → ad creatives → ads
- `publish-campaign-tiktok` → via existing US Cloudflare Worker proxy
- `publish-campaign-google` → Google Ads API

All run with **dry-run mode** by default; flips to real after approval. Failures roll back via stored `platform_ids[]`.

---

## 7. "Game-Changer" Add-Ons (cheap to bolt on later)

1. **Auto-Budget Suggestion** — based on client's avg daily spend × angle confidence
2. **Creative Auto-Generation** — image ads via `google/gemini-3.1-flash-image-preview`
3. **Localized Variants** — one click → translates copy into client's language (Bangla/EN)
4. **Post-Launch Watcher** — if CPA > target × 1.5 in first 48h, AI proposes pause/edit via existing `ai_pending_actions`
5. **Clone Winner** — "Make 3 variants of my best-performing campaign for this new product"

---

## 8. Data model (new tables)

- `ai_campaign_drafts` — id, org_id, client_id, ad_account_id, user_id, status (draft/approved/published/failed), product_brief, research_json, draft_json, version, created_at
- `ai_campaign_draft_versions` — snapshots for diff/rollback
- `ai_campaign_publish_logs` — per-node platform_id, request, response, error

All RLS-isolated by `org_id = get_user_org_id(auth.uid())` (per project security rules in memory).

---

## 9. Technical Details

- **Edge functions**: `ai-campaign-research`, `ai-campaign-generate`, `ai-campaign-regenerate-node`, `publish-campaign-meta` (+tiktok/google later)
- **AI**: Lovable AI Gateway. Research = `gemini-2.5-pro`, draft = `gemini-3-flash-preview` with tool-calling for structured output, image = `gemini-3.1-flash-image-preview`
- **Optional**: Perplexity connector for competitor research (only if user wants live web data)
- **Frontend**: new route `/ai-campaign-builder`, reuses `ChatMarkdown`, `NovaPendingActions`, existing client/ad-account pickers
- **Naming engine**: small helper `buildCampaignNames(client, draft)` so naming is testable and deterministic
- **Safety**: per-org daily AI quota, rate-limit 5 generations/min/user, never publish without `ai_pending_actions.status='approved'`

---

## 10. Suggested Build Order

1. DB migration + RLS + types
2. `ai-campaign-research` edge function + UI for Step 1–4
3. `ai-campaign-generate` with structured output + draft tree UI
4. Inline edit + per-node regenerate
5. Approval queue wiring (reuse `ai_pending_actions`)
6. Meta publisher (highest ROI platform first)
7. TikTok + Google publishers
8. Image generation + multilingual + post-launch watcher

Shipping just steps 1–5 already delivers the "AI drafts a full campaign, human approves" experience. Steps 6+ make it actually publish.

---

**Question before I start building:** want me to begin with **Meta-only** end-to-end (research → draft → approve → publish) so you can feel the full magic on one platform, or build the **research + draft + approval UI first** for all platforms and add publishers afterward?
