## Problem

Meta deep-dive **is** writing rows (verified in `daily_metrics`), but several metric columns stay at `0` even when the underlying actions exist in the API response. Live sample from this client (last 3 days):

- `purchase` = 0 across **every** Meta row, even though the edge-function log shows `omni_purchase=2`, `onsite_web_purchase=2`, `onsite_app_purchase=2`, `onsite_conversion.purchase=2` on the same campaign/day.
- `new_messaging_contacts` is actually being populated with **messaging replies**, not new contacts.
- `results` only counts 4 hard-coded action types, so messaging-objective and Advantage+ campaigns under-report.
- `create_order` works for messaging orders, but misses the non-`_v2` variant and `onsite_web_lead`-style order events.

Root cause: in `supabase/functions/sync-deep-dive/index.ts` (lines 571-598) the action-type matchers are too narrow. Meta returns the **same conversion** under several attribution buckets (`offsite_conversion.fb_pixel_*`, `onsite_conversion.*`, `onsite_web_*`, `onsite_app_*`, `omni_*`). We only read the `offsite_conversion.fb_pixel_*` variants — perfect for classic Pixel campaigns, but wrong for messaging / Advantage+ / app campaigns which the client mostly runs.

## Fix (Meta branch only, `sync-deep-dive/index.ts` ~lines 566-598)

Replace the matcher block with a unified mapper that picks the **best available signal per metric**, preferring the unified `omni_*` counter when present, falling back to `onsite_* + offsite_*` otherwise — and never double-counting on the same row.

Per-metric mapping:

| Column | Matched action_type (in priority order) |
|---|---|
| `purchase` | `omni_purchase` → else sum of `onsite_web_purchase` + `onsite_app_purchase` + `onsite_conversion.purchase` + `offsite_conversion.fb_pixel_purchase` |
| `view_content` | `omni_view_content` → else `offsite_conversion.fb_pixel_view_content` + `onsite_web_view_content` |
| `add_to_cart` | `omni_add_to_cart` → else `offsite_conversion.fb_pixel_add_to_cart` + `onsite_web_add_to_cart` |
| `initiate_checkout` | `omni_initiated_checkout` → else `offsite_conversion.fb_pixel_initiate_checkout` + `onsite_web_initiate_checkout` |
| `messaging_conversations` | `onsite_conversion.messaging_conversation_started_7d` (unchanged) |
| `new_messaging_contacts` | `onsite_conversion.total_messaging_connection` (fix — current code uses replies) |
| `create_order` | `onsite_conversion.messaging_order_created_v2` + `onsite_conversion.messaging_order_created` + `onsite_conversion.messaging_block_create_order` |
| `results` | `omni_purchase` + `lead` + `onsite_conversion.lead_grouped` + `onsite_conversion.purchase` + `complete_registration` + `onsite_conversion.messaging_conversation_started_7d` (whichever the campaign optimises for; sum is fine because Meta already de-duplicates inside `omni_*`) |
| `conversion_value` | already correct; extend to also read `omni_purchase` value when `offsite_conversion.fb_pixel_purchase` value is absent |

Implementation notes:
- Build a `Map<string, number>` from `row.actions` once per row, then read by key — cleaner and avoids the current cascading `if` chain.
- Same for `row.action_values`.
- Keep the existing `metaRowIndex < 3` debug log so we can verify mapping in production.
- No URL / field-list change — all these action types are already returned by the existing `actions` field.

## Verification

1. Trigger Deep Dive Sync on this client (Meta-heavy) for last 3 days.
2. Re-run the same `daily_metrics` query — `purchase` should match the `omni_purchase` / `onsite_*_purchase` values seen in the function log (e.g. `Hijbullah/Mejoo/KK/CBO/A+` 2026-06-12 should show `purchase ≥ 2`).
3. `new_messaging_contacts` should now equal `total_messaging_connection`, not `messaging_first_reply`.
4. `results` for messaging-objective campaigns should be non-zero (was 0 before for many).
5. Regression: messaging-conversation, spend, impressions, clicks, create_order values must not decrease.

## Files to change

- `supabase/functions/sync-deep-dive/index.ts` — Meta `actions` / `action_values` loop only (~lines 566-598 + line 595 for `action_values`).

## Out of scope

- TikTok / Google branches.
- Meta fast-lane (it only fetches spend).
- DB schema, orchestrator, worker, attribution logic.
- TikTok HTTP 546 CPU-limit failures (pre-existing, separate issue).
