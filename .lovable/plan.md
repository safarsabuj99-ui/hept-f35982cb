

## Plan: Fix Duplicate Spend Attribution in Finance Dashboard

### Problem
The Finance Dashboard attributes **total ad account spend to every client** mapped to that account. When 3 clients share one TikTok ad account with $22.93 total spend, each client incorrectly shows $22.93 instead of their individual campaign spend. This inflates revenue, COGS, profit, and the net profit KPI by 3x.

### Root Cause
In `FinanceDashboard.tsx` (lines 120-129), the spend aggregation loop looks up the ad account for each campaign metric, then distributes that metric's spend to **all clients mapped to the ad account** via `accToClients[accountId]`. It ignores the campaign's own `client_id` field, which already contains the correct attribution.

### Fix

**File: `src/pages/FinanceDashboard.tsx`**

1. **Fetch `client_id` from campaigns**: Change the campaigns query from selecting `id, ad_account_id, platform` to also include `client_id`.

2. **Build a campaign-to-client map**: Create `campaignToClient` mapping each campaign ID to its assigned `client_id`.

3. **Replace the spend attribution loop**: Instead of iterating over all clients for the ad account, use the campaign's `client_id` directly:

```text
BEFORE (broken):
  For each metric row:
    → Find ad account → Find ALL clients on that account
    → Give FULL spend to EACH client  ← DUPLICATES

AFTER (fixed):
  For each metric row:
    → Find campaign's client_id directly
    → Give spend ONLY to that client  ← CORRECT
```

4. **Remove `accToClients` lookup**: The `ad_account_clients` query and `accToClients` map are no longer needed for spend attribution (can be removed entirely to simplify the code).

### Result
Each client will show only their actual campaign spend, and revenue/COGS/profit/margin will be calculated correctly per client. The Net Profit KPI will reflect the true agency-wide figure.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/FinanceDashboard.tsx` | Use campaign `client_id` for spend attribution instead of ad account client list |

