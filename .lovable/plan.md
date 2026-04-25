## Problem

On the **Payments & Deposits** page (`/admin/payment-requests`), when an admin selects a date filter (e.g. "Today", "This Week", custom range), **pending payment requests from clients also get hidden** if their submission date falls outside the range. This means a client may submit a request that the admin never sees because their filter is set to a different period.

## Goal

**Pending payment requests must always be visible**, regardless of the date filter. The date filter should only narrow down **approved** and **rejected** requests (historical records), so KPI cards and history views remain useful.

In short:
- Pending requests → always shown (no date filter applied)
- Approved / rejected requests → filtered by the selected date range

## Changes

### `src/pages/PaymentRequests.tsx`

Update the `filteredRequests` memo so the date-range filter only applies to rows where `status !== "pending"`:

```text
filteredRequests = [
  ...all pending requests (search-filtered only),
  ...approved/rejected requests (search + date filtered)
]
```

- Pending rows bypass the `dateRange` check entirely.
- Search query still applies to all rows (so admins can still search within pending).
- Sort order preserved: pending first (newest), then approved/rejected newest first — matches current `created_at DESC` ordering from the query.
- KPI cards (`Received BDT`, `Received USD`, `Approved Count`, `Pending Count`) keep using `filteredRequests`. Since pending is always included, the "Pending" KPI now reflects the true total of pending items (correct behavior). Approved totals still respect the date range.

### Out of scope
- The **Fund Deposits** tab is not changed in this request. If you also want pending deposits to ignore the date filter, say the word and I'll mirror the same logic in `filteredDeposits`.
- The default date preset stays as it is — no change to `DateRangeFilter`.
- No database, RLS, or edge function changes.
