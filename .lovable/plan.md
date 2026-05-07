## Problem

On the client-side `Performance Analytics` page (`/dashboard/reports`), columns like **Messages, New Contacts, Returning, Create Order, Cost/Message, Purchase, Add-to-Cart, ROAS, CPM, Reach** all render `0` even when the agency-side view shows real numbers for the same campaigns and date range.

## Root Cause

`src/pages/ClientReports.tsx` fetches `daily_metrics` with `select("*")` (so the data is there), but its `campaignRows` `useMemo` only sums a small subset of fields:

```
impressions, clicks, spend, results, conversion_value, budget,
conversations_tiktok_dm, leads_tiktok_dm, conversations_instant_msg
```

Every other metric (`messaging_conversations`, `new_messaging_contacts`, `create_order`, `purchase`, `add_to_cart`, `initiate_checkout`, `view_content`, `reach`, `cpm`, `cost_per_purchase`, `cost_per_message`) is dropped, so `DeepDiveTable` receives `undefined` and shows `0`.

The agency-side `CampaignMapping.tsx` and `ClientDetail.tsx` aggregate the full metric set and recompute derived ratios (`cost_per_purchase`, `cost_per_message`, `cpm`) from aggregated totals — that is why those views display correctly.

## Fix

Bring the client `campaignRows` aggregation to parity with the agency one (presentation-layer only — no data-fetching or RLS changes).

**File:** `src/pages/ClientReports.tsx`

1. Initialise every supported metric to `0` when creating a row in `map`, matching the field set used in `CampaignMapping.tsx`:
   `view_content, add_to_cart, initiate_checkout, purchase, messaging_conversations, new_messaging_contacts, create_order, reach, cpm, cost_per_purchase, cost_per_message`, plus the existing TikTok DM / Instant Msg fields.
2. Sum each of these fields across `rawMetrics` (using `Number(m.<field> ?? 0)`).
3. After the sum loop, recompute derived fields from aggregated totals:
   - `cost_per_purchase = spend / purchase` when `purchase > 0`
   - `cost_per_message = spend / messaging_conversations` when `messaging_conversations > 0`
   - `cpm = (spend / impressions) * 1000` when `impressions > 0`
4. Keep the existing "inject active campaigns with no metrics" block and the final filter (active OR has any non-zero core metric) — already aligned with the agency view.

No changes to:
- Database queries, RLS, or permissions
- `DeepDiveTable` columns / preset logic
- `CampaignAnalyticsPanel` KPI cards (they will start showing real numbers automatically once `messaging_conversations` etc. are populated)

## Result

Client `/dashboard/reports` will display the same metric values as the agency-side analytics for the same client and date range.
