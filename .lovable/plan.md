## Goal

Fix two issues in the AI Campaign Builder:
1. No way to pick a campaign **Objective**.
2. Campaign/Ad Set/Ad names should follow a strict convention based on client keyword + product/offer name.

## Changes

### 1. DB migration — `ai_campaign_drafts`
Add two columns:
- `objective text` — Sales | Leads | Traffic | Messages | Awareness | App Installs
- `product_name text` — free-text product/offer name

Nullable for backward compatibility with existing drafts.

### 2. UI — `src/pages/AICampaignBuilder.tsx`
In the Setup card, add two new required fields after Ad Account:
- **Objective** (Select): Sales, Leads, Traffic, Messages, Awareness, App Installs.
- **Product / Offer name** (Input): e.g. "Premium Honey 500g".

Behavior:
- Persist both in `localStorage` (`aicb:lastObjective`, `aicb:lastProductName`).
- Show a live naming preview chip:
  `{keyword} | {product_name} | {OBJECTIVE} | YYMMDD`
- Disable Research and Generate Draft buttons until Client, Ad Account, Objective, and Product Name are all set.
- Send `objective` and `product_name` when inserting into `ai_campaign_drafts`.

### 3. Edge function — `supabase/functions/ai-campaign-generate/index.ts`
- Fix client lookup: query `profiles` by `user_id` (current code uses `profiles.id`, which now breaks because `draft.client_id` holds `auth user_id`).
- Read `draft.objective` and `draft.product_name`.
- Hard-lock naming convention in the AI prompt:
  - Campaign: `{keyword} | {product_name} | {OBJECTIVE} | {YYMMDD}`
  - Ad Set:   `{keyword} | {product_name} | {AUDIENCE_LABEL} | {PLACEMENT}`
  - Ad:       `{keyword} | {product_name} | {FORMAT} | v{N}`
- After the model returns JSON, validate/overwrite `campaign.objective` to match the user-selected value (in case the model deviates).

## Files touched
- New migration (adds `objective`, `product_name` to `ai_campaign_drafts`)
- `src/pages/AICampaignBuilder.tsx`
- `supabase/functions/ai-campaign-generate/index.ts`

No changes to `ai-campaign-research`, RLS, or auth.