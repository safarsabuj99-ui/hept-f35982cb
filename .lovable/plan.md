# Show Client Wallet Balance Consistently Everywhere

Rule (matches the Client Wallet hero card):

- If overall USD balance **≥ 0** → show `$X.XX` (USD)
- If overall USD balance **< 0** → show `-৳X.XX` using the **net BDT** across platforms (`computeNetBdt`), so TikTok surplus offsets Meta debt using each platform's own rate.

The only change vs. today is **which BDT formula is used when negative**: switch from `computeBdtDebt` (sum of negative buckets only) → `computeNetBdt` (signed sum across all platforms). This matches the wallet hero and fixes the inflated debt shown when one platform has a positive offset.

## Files to update

### 1. `src/pages/ClientList.tsx` (admin Client List)
- In the fetch block, replace `computeBdtDebt(...)` with `Math.abs(computeNetBdt(...))` for the `bdtMap` value (only stored/used when balance < 0).
- Keep existing UI: USD pill when `bal ≥ 0`, `-৳…` pill when `bal < 0`. No layout changes.

### 2. `src/components/dashboard/ClientSearchCommand.tsx` (global ⌘K search)
- Inside `computeBdtDebt(client)` local wrapper, call `sharedComputeNetBdt` instead of `sharedComputeBdtDebt` and return its absolute value (it's only used when `c.balance < 0`).
- Rename local helper to `computeBdtAmount` to avoid confusion. No UI changes — row still shows `$X` when positive, `−৳X` when negative; portfolio strip's "bdt debt" total is now the sum of *net* BDT for negative clients (more accurate).

### 3. `src/pages/ClientDashboard.tsx` (client's own dashboard)
- Replace the hand-rolled `balanceBdt` `useMemo` body with `computeNetBdt(pricingConfig, wallet)` so the client dashboard hero uses the same single source of truth as the wallet hero. Behavior is unchanged for already-correct cases; fixes mismatch when one platform is positive and another negative.

## Out of scope
- No UI/layout changes — only the BDT number changes when negative.
- `LowBalanceAlerts`, admin dashboard debt KPIs, payment-request views: these are intentionally *debt-only* alarms, kept on `computeBdtDebt`.
- No DB / RPC / edge-function changes. `get_admin_dashboard_summary` already returns `pricing_config` + `platform_balances` needed by `computeNetBdt`.
