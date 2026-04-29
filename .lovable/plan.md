## Bug Found

The **Sales preset** shows blank/zero data for TikTok campaigns because:

1. **`sync-deep-dive/index.ts` (TikTok branch)** never requests or writes the sales-funnel metrics (`view_content`, `add_to_cart`, `initiate_checkout`, `purchase`, `cost_per_purchase`). Only the Meta branch populates these. The TikTok `upsertMetrics` call simply omits them, so they default to `0`.
2. **TikTok campaign objective is never fetched/stored.** Only Meta sets `objective` via `metaObjectiveMap`. So in "auto" preset mode the table also can't recognize TikTok sales campaigns (the row's `objective` is empty, the auto-detector falls back to `hasObjectiveData.sales` which is always false because the funnel fields are zero — a circular dead end).
3. The TikTok request currently asks for: `spend, impressions, clicks, ctr, cpc, conversion, conversion_cost, complete_payment_roas, reach, onsite_form, onsite_on_web_detail`. It's missing the standard TikTok sales-funnel metrics.

## Fix

### 1. `supabase/functions/sync-deep-dive/index.ts` — TikTok request metrics

Add TikTok's sales-funnel metric names to **both** the BC-scoped and direct-advertiser request URLs (lines ~708 and ~735):

Add: `total_view_content, total_add_to_cart, total_initiate_checkout, total_complete_payment, cost_per_complete_payment`

(These are TikTok's official "Total" web/app pixel funnel metrics, which mirror Meta's `view_content / add_to_cart / initiate_checkout / purchase`. They aggregate web + app + offline events.)

### 2. Map and write the new metrics

In the TikTok row loop (lines ~833–892), parse the new fields and pass them into `upsertMetrics`:

```ts
const viewContent      = parseFloat(row.metrics?.total_view_content      || "0");
const addToCart        = parseFloat(row.metrics?.total_add_to_cart        || "0");
const initiateCheckout = parseFloat(row.metrics?.total_initiate_checkout  || "0");
const purchase         = parseFloat(row.metrics?.total_complete_payment   || "0");
const costPerPurchase  = parseFloat(row.metrics?.cost_per_complete_payment || "0");

await upsertMetrics(campaignDbId, dataDate, {
  ...existing fields,
  view_content: viewContent,
  add_to_cart: addToCart,
  initiate_checkout: initiateCheckout,
  purchase: purchase,
  cost_per_purchase: convertSpend(costPerPurchase),
});
```

Note: `cost_per_purchase` runs through `convertSpend()` so BDT-priced TikTok accounts normalize to USD just like `spend`.

### 3. Fetch + store TikTok campaign objective

In the existing `campaign/get/` status fetch loop (line ~785), also extract `objective_type` from each campaign and build a `tiktokObjectiveMap`. Then map to the same simplified labels the front-end expects:

```text
TikTok objective_type             → simplified label
WEB_CONVERSIONS / PRODUCT_SALES   → "sales"
LEAD_GENERATION                   → "leads"
TRAFFIC                           → "traffic"
ENGAGEMENT                        → "engagement"
REACH                             → "awareness"
VIDEO_VIEWS                       → "video_views"
APP_PROMOTION                     → "app_promotion"
```

Pass `objective` into `upsertCampaign(...)` so the `campaigns.objective` column is populated. The existing `upsertCampaign` already accepts an `objective` param (line 252) — TikTok just isn't passing one today.

Add `objective_type` to the `fields` query string of the status fetch — it's already returned by default but make it explicit if needed.

### 4. (Optional polish) Fast-lane parity

`sync-fast-lane/index.ts` (TikTok branch ~line 407) is the "live spend" lane and only writes spend/clicks/impressions — it does NOT need sales-funnel data (deep-dive owns that). Leave fast-lane untouched to keep it fast. Sales data will appear after the next deep-dive cycle.

## Files Changed

- `supabase/functions/sync-deep-dive/index.ts` — only file modified

## Verification

After deploy + one deep-dive run:
- `daily_metrics` rows for TikTok campaigns will have non-zero `view_content / add_to_cart / initiate_checkout / purchase` where the pixel is firing.
- `campaigns.objective` will be `"sales"` for TikTok web-conversion / product-sales campaigns.
- The Sales preset in `DeepDiveTable` will render real numbers for TikTok rows, and the **Auto** preset will correctly auto-detect sales campaigns on TikTok.
