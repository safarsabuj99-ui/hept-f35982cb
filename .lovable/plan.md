

## Plan: Fix Collections KPI Using `payment_date` Instead of `created_at`

### Root Cause

The `get_admin_dashboard_summary` RPC function calculates "Today's Collections" by filtering on `created_at::date`, but this is the **submission date** — not the actual collection date. The correct column is `payment_date`, which represents when the money was actually received.

**Example from your data:** A ৳4,000 payment has `payment_date = 2026-04-14` (today) but `created_at = 2026-04-13` (yesterday in UTC). The dashboard shows ৳0 because `created_at::date` doesn't match today.

**Secondary bug:** The collections query is also missing the `org_id = p_org_id` filter that all other queries have — a multi-tenant data leak.

### What Changes

One database migration to update the `get_admin_dashboard_summary` RPC function:

1. **Collections in range (line 66-71)** — change `(created_at::date)` to `payment_date` and add `org_id = v_org_id` filter
2. **7-day collection sparkline (line 84-92)** — change `(pr.created_at::date)` to `pr.payment_date` in the join condition

### Technical Detail

```sql
-- Before (broken):
SELECT COALESCE(SUM(amount_bdt), 0)
FROM payment_requests
WHERE status = 'approved'
  AND (created_at::date) >= p_date_from
  AND (created_at::date) <= p_date_to;

-- After (fixed):
SELECT COALESCE(SUM(amount_bdt), 0)
FROM payment_requests
WHERE status = 'approved'
  AND payment_date >= p_date_from
  AND payment_date <= p_date_to
  AND org_id = v_org_id;
```

Same fix applied to the sparkline subquery.

### Files Changed
| Action | File |
|--------|------|
| Migration | Update `get_admin_dashboard_summary` — use `payment_date` + add `org_id` filter |

### Expected Result
Today's Collections KPI will correctly show ৳4,000 (and any other collections made today), and the sparkline will accurately reflect daily collection history by actual payment date.

