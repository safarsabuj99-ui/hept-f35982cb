## Why nothing is happening today

When you click **Approve & queue**, the app does two things:

1. Sets the draft's `status = "approved"` in `ai_campaign_drafts`.
2. Inserts a row into `ai_pending_actions` with `tool_name = "campaign.publish_draft"`.

That's it. The "queue" never runs. When that pending action is approved through Nova, `supabase/functions/ai-action-execute/index.ts` looks at `tool_name`, doesn't find a `campaign.publish_draft` case in its `switch`, falls through to the **default branch**, and just returns `{ ok: true, handoff: true, ... }` — which means "approved and filed, copy-paste from here". No call to Meta or TikTok is ever made, so nothing appears in the ad account. There is no `ai-campaign-publish` edge function in the project at all.

We need to actually publish the draft tree to the platform.

## Plan

### 1. New edge function `ai-campaign-publish`
Path: `supabase/functions/ai-campaign-publish/index.ts`

Input: `{ draft_id }` with the caller's JWT.

Flow:
- Load the draft (must be `status in ('ready','approved')` and have `draft_json`).
- Load the linked `ad_accounts` row → get `platform_name`, `platform_account_id`, decrypted `access_token`.
- Set draft `status = 'publishing'`, clear `error`.
- Build the platform tree from `draft_json` (campaign → ad_sets → ads) and create each node via the platform API in order, capturing the returned platform IDs.
  - **Meta (v21.0)**: `POST /act_{account_id}/campaigns`, then `/adsets`, then `/ads` (with attached `adcreative`). Daily budget converted to account currency minor units. Status created as `PAUSED` so nothing spends accidentally on first publish — the user can flip it on inside the platform or from our Campaigns Hub.
  - **TikTok**: route through the existing US Cloudflare Worker proxy (see memory `architecture/tiktok-proxy-egress-strategy`), endpoints `campaign/create/`, `adgroup/create/`, `ad/create/`.
- On success: update draft to `status='published'`, store the returned IDs back into `draft_json.publish_result` and into a new row of `ai_campaign_publish_logs` (table already exists).
- On any failure: roll the draft to `status='failed'`, write the error to `draft.error`, and best-effort delete already-created nodes in reverse order so the ad account isn't left with orphans.

CORS + JWT validation handled the standard way (mirror `ai-campaign-generate`). No `config.toml` change needed (default `verify_jwt = true` is fine here).

### 2. Wire the Approve button to the real publisher
File: `src/pages/AICampaignBuilder.tsx` (`approveMutation`, ~line 160-175)

- Keep the `status = 'approved'` update.
- Replace the `ai_pending_actions` insert with a direct `supabase.functions.invoke("ai-campaign-publish", { body: { draft_id } })` call.
- On success show `"Publishing to {platform}…"`, then poll/realtime the draft row until `status` becomes `published` or `failed` and surface the result (link to the new campaign in the Campaigns Hub on success, or the error message on failure).
- Disable the button while `status in ('publishing','published')`.

### 3. Stop the dead-end Nova handoff for this tool
File: `supabase/functions/ai-action-execute/index.ts`

- Remove `"campaign.publish_draft"` references from the default handoff path (it's no longer used). No other behavior changes here.

### 4. Verification
- Approve a tiny test draft against a real Meta ad account → confirm a PAUSED campaign + ad set + ad appear in Ads Manager and the draft flips to `published` with the new IDs visible in `ai_campaign_publish_logs`.
- Force-fail (e.g. invalid budget) → confirm draft goes to `failed`, error surfaces in the UI, and no orphan objects remain in the ad account.

## Out of scope
- No schema migrations — `ai_campaign_drafts`, `ai_campaign_publish_logs`, and `ad_accounts` already have the fields we need.
- No change to research / generate / refine stages.
- Creatives are published with the brief + provided URL only; image/video asset upload from the brief stays manual for now.

## Open question
Default initial status of newly created campaigns: **PAUSED** (safe — recommended) or **ACTIVE** (instant spend)? I'll go with PAUSED unless you say otherwise.
