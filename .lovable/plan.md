## Goal

Make every metric column in the Spend deep-dive table show **exactly the same number Meta Ads Manager / TikTok / Google show** for that campaign — no sums, no double counting, no inflated "Results".

The current bug (after the last fix): Results = 115 for a messaging campaign whose Ads Manager "Results" is 87. Same row also has create_order = 13, purchase = 0 — that is correct, but Results is summing messages + create_order + leads + registrations, which Meta itself never does.

## Rule

For each row, **Results = the single counter for that campaign's optimisation goal**, picked from `campaigns.objective`:

| Meta objective (from `effective_status`/`objective` field) | Result counter |
|---|---|
| `OUTCOME_SALES`, `CONVERSIONS`, `PRODUCT_CATALOG_SALES` | `omni_purchase` → else sum of `*_purchase` variants |
| `OUTCOME_LEADS`, `LEAD_GENERATION` | `lead` + `onsite_conversion.lead_grouped` + `onsite_web_lead` + `offsite_complete_registration_add_meta_leads` |
| `OUTCOME_ENGAGEMENT`, `MESSAGES`, `OUTCOME_MESSAGES`, `MESSAGING_CONVERSATIONS_STARTED` | `onsite_conversion.messaging_conversation_started_7d` |
| `OUTCOME_APP_PROMOTION`, `APP_INSTALLS` | `app_install` + `mobile_app_install` |
| `OUTCOME_AWARENESS`, `REACH`, `BRAND_AWARENESS` | `reach` (already a top-level field) |
| `OUTCOME_TRAFFIC`, `LINK_CLICKS` | `link_click` (or top-level `clicks`) |
| `VIDEO_VIEWS` | `video_view` |
| Unknown / missing objective | pick the **largest single counter** among purchase / lead / messaging — never sum |

Same idea for TikTok and Google: keep using whatever single counter their API returns as the optimisation result (TikTok already does this via `result` field — verify, don't change unless broken).

Other columns stay independent (no change):

- `messaging_conversations` = `onsite_conversion.messaging_conversation_started_7d`
- `new_messaging_contacts` = `onsite_conversion.total_messaging_connection`
- `create_order` = `messaging_order_created_v2` + `messaging_order_created` + `messaging_block_create_order`
- `purchase` = `omni_purchase` → fallback to `*_purchase` variants
- `view_content`, `add_to_cart`, `initiate_checkout` = matching `omni_*` → `offsite_conversion.fb_pixel_*` fallback
- `conversion_value` = pixel purchase value → `omni_purchase` value fallback

## Implementation

File: `supabase/functions/sync-deep-dive/index.ts` (Meta branch only, ~lines 620-635)

1. Make sure `objective` is captured per row. It already is — `metaObjectiveMap[rawCampaignId]` exists (line 607). Pass it into the result picker.
2. Replace the current `results = preferOmni(...)` block with a `switch` on the normalised objective string that selects exactly **one** counter from `actionMap`.
3. Keep the same `actionMap` / `valueMap` setup from the previous fix — only the `results` assignment changes.
4. Leave TikTok branch alone for now (it already writes the platform's own `result` field). If user reports TikTok Results is wrong, address separately.

## Verification

1. Trigger Deep Dive Sync on this client for 2026-06-17 → 2026-06-18.
2. Query a few rows and compare to Meta Ads Manager:
   - Messaging campaign (`Lajbonti2/DC2`, 2026-06-18) → `results` should equal `messaging_conversations` (87), not 115.
   - Any sales/conversion campaign → `results` should equal `purchase`.
   - Any lead campaign → `results` should equal the lead counter sum.
3. KPI cards "Total Results" / "Total Messages" / "Create Order" on the client Spend page should match what the agency sees in each platform's native dashboard.
4. Regression: `spend`, `impressions`, `clicks`, `purchase`, `messaging_conversations`, `create_order`, `conversion_value` unchanged.

## Files to change

- `supabase/functions/sync-deep-dive/index.ts` — Meta `results` mapping only.

## Out of scope

- TikTok / Google branches (no reported issue).
- Historical rows — will self-heal when the user runs a Deep Dive on the affected date range.
- Frontend display logic / KPI cards (they already read the DB column directly).
