## Root cause (verified against live DB)

The "All Clients" page reads the `transactions` table with a plain `.select(...).eq("status","completed")` call. Supabase silently caps SELECTs at **1000 rows**. Today the table has **1056** completed transactions, so the **most recent 56 transactions are dropped**. Because 99 % of recent rows are `auto_spend` debits, dropping them makes balances look **falsely high**.

### Live proof (sums computed from full DB vs values shown on screen)

| Client | Shown in UI | Real sum from DB | Phantom credit |
|---|---|---|---|
| MD HASIB FAKIR | $249.73 | $168.95 | +$80.78 |
| Tofail Ahmed | $35.41 | $20.09 | +$15.32 |
| Kawsar | $10.32 | $1.94 | +$8.38 |
| Saif | $9.91 | $9.91 | 0 (early in dataset) |

The gap exactly matches the recent debits being chopped off the 1000-row window.

The same bug pattern exists on every page that reads `transactions` or `daily_metrics` without pagination. Project memory already calls this out as a Core rule; the fix helper `src/lib/fetchAllRows.ts` already exists but was not adopted in these pages.

## Fix plan

### 1. Use `fetchAllRows` for every aggregation query (the actual fix)

Replace the direct `.select(...)` with the existing `fetchAllRows(() => …)` helper in the files that compute balances or spend totals:

- `src/pages/ClientList.tsx` — `transactions`, `daily_metrics`, `campaigns`, `ad_account_clients`.
- `src/pages/ClientDetail.tsx` — `transactions`, `daily_metrics`.
- `src/pages/ClientDashboard.tsx` — `transactions`, `daily_metrics`.
- `src/pages/ManagerDashboard.tsx` — `transactions`.
- `src/pages/TeamMemberDetail.tsx` — `transactions`.
- `src/components/LowBalanceAlerts.tsx` — `transactions`.
- `src/components/dashboard/ProfitabilityTable.tsx` — `daily_metrics`.
- `src/components/ClientProfitTab.tsx` — `daily_metrics`.
- `src/components/RunwayPrediction.tsx` — `transactions`.
- `src/components/PlatformTransferDialog.tsx` — `transactions`.
- `src/components/dashboard/RecentActivityFeed.tsx` — leave as-is (it explicitly only wants the latest N rows; pagination would defeat the purpose). Add an explicit `.limit(N).order(...)` so its 1000 cap is intentional, not silent.

No business logic, RLS, currency math, or schema changes — only swapping the read call.

### 2. Add a build-time guard so this can't silently happen again

Add a lint rule (eslint custom rule in `eslint.config.js`) that flags any call matching `supabase.from(<aggregating-table>).select(...)` without either:
- an enclosing `fetchAllRows(...)`, **or**
- an explicit `.limit(n)` chained on it.

Aggregating tables: `transactions`, `daily_metrics`, `campaigns`, `daily_ad_spend`, `ad_account_clients`, `campaign_performance`, `campaign_mappings`. This makes the "you forgot pagination" mistake fail CI instead of silently corrupting balances.

### 3. Self-check on the affected page (cheap safety net)

Inside `ClientList.tsx`, after the data load, add a single console-warning when the raw row count from any aggregate query equals exactly the page size — same pattern `fetchAllRows` already uses. Future regressions will be visible in the browser console immediately.

## Verification after deploy

Re-run the comparison query for the four sample clients above; the on-screen balances should match the SQL sums to the cent. The bug is deterministic, so this verifies the whole class of affected pages at once.

## What this does NOT change

- No changes to RLS, auth, schema, currency conversion, BDT/USD policy, ERP math, or the wallet debit attribution rule (still via `campaigns.client_id`).
- No changes to the underlying `transactions` data — only how it is read.
- No edge-function changes.

## Files touched

- `src/pages/ClientList.tsx`
- `src/pages/ClientDetail.tsx`
- `src/pages/ClientDashboard.tsx`
- `src/pages/ManagerDashboard.tsx`
- `src/pages/TeamMemberDetail.tsx`
- `src/components/LowBalanceAlerts.tsx`
- `src/components/dashboard/ProfitabilityTable.tsx`
- `src/components/ClientProfitTab.tsx`
- `src/components/RunwayPrediction.tsx`
- `src/components/PlatformTransferDialog.tsx`
- `src/components/dashboard/RecentActivityFeed.tsx` (add explicit `.limit`)
- `eslint.config.js` (new guard rule)
