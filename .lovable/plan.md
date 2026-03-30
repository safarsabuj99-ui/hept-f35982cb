

# Plan: Reorder TrxID & Add KPI Widgets to Payments Page

## 1. Move TrxID below USD (mobile cards)

In the mobile card layout (lines 305-361), swap the order so USD appears before TrxID:

```text
Current order:     →  New order:
Amount/Method/Date    Amount/Method/Date
TrxID                 USD: $13.79
USD: $13.79           TrxID: 2000 টাকা...
```

Move the USD line out of the footer div and place it above TrxID as its own line.

## 2. Add KPI summary widgets above the tabs

Add a row of compact stat cards between the DateRangeFilter and Tabs showing filtered totals for approved payments:

- **Total Received (BDT)** — sum of `amount_bdt` for approved requests in date range
- **Total Credited (USD)** — sum of `final_amount_usd` for approved requests in date range
- **Approved Count** — number of approved requests in date range
- **Pending Count** — number of pending requests in date range

These are computed from the already-fetched `filteredRequests` array using `useMemo` — no new API calls needed. Styled as compact KPI cards matching the project's existing design system.

## Files Modified

1. **`src/pages/PaymentRequests.tsx`**
   - Add `useMemo` block computing KPI totals from `filteredRequests`
   - Insert KPI card row between DateRangeFilter and Tabs
   - Reorder mobile card: move USD line above TrxID line

