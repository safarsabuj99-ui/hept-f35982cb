
## Plan: Fix USD inventory so Available Balance, Client Needed USD, auto-spend detection, and auto-refresh work reliably

### What I found
1. **The auto refresh job is broken**
   - `auto-snapshot-usd` is failing in backend logs with:
     `record "new" has no field "client_id"`
   - Root cause: `usd_inventory_snapshots` still has an old trigger `trg_set_usd_inventory_snapshots_org_id` using `set_org_id_from_auth()`, which expects `NEW.client_id`.
   - That table does not have `client_id`, so every auto snapshot write crashes.

2. **The wallet card depends on snapshots only**
   - `WalletInventory.tsx` reads the latest row from `usd_inventory_snapshots`.
   - When auto snapshots fail, the card gets stuck and keeps showing an old balance.

3. **The current UI and backend logic are mismatched**
   - The UI expects metrics like `carry_forward`, `bought_since`, and `spent_since`.
   - But `auto-snapshot-usd` only stores totals from full recomputation, so parts of the card are not truly aligned.
   - The page also has **Opening Balance / Close Period**, but the current auto function does not properly treat those as a baseline.

### Smart fix I will implement
#### 1) Fix the crashing backend trigger
- Remove the broken trigger from `usd_inventory_snapshots`.
- Keep the snapshot-specific trigger `set_org_id_snapshots`, which is the correct one.

#### 2) Make USD inventory calculation consistent
- Update `auto-snapshot-usd` so it calculates from a proper **baseline**:
  - latest opening balance / period close
  - plus purchases since baseline
  - minus ad spend since baseline
  - minus manual USD spends since baseline
- Store clear metrics in the snapshot:
  - `carry_forward`
  - `bought_since`
  - `spent_since`
  - `manual_spend`
  - `daily_burn`
  - `runway_days`
  - `client_obligations`
  - `usd_needed`

This keeps your “original/current balance” logic intact and avoids random-looking numbers.

#### 3) Make the wallet refresh immediately
- In `WalletInventory.tsx`, after:
  - Buy USD
  - Spend USD
  - Set Opening Balance
  - Close Period
- immediately invoke `auto-snapshot-usd`, then reload the overview.
- This removes the wait for the 5-minute job and makes the card update right away.

#### 4) Make auto-spend detection refresh the wallet too
- Add wallet realtime refresh hooks for spend-related changes (`daily_metrics` / relevant balance activity).
- When spend data lands, the wallet overview will refresh automatically instead of waiting and appearing stale.

#### 5) Make snapshot reading safer
- Fetch the latest valid snapshot using stronger ordering, not only by `snapshot_date`.
- This prevents the page from accidentally reading an older/stale row when multiple writes happen close together.

#### 6) Repair the current data
- Run the fixed snapshot refresh once after the backend repair.
- That will rewrite today’s inventory so:
  - **Available Balance** shows the true current amount
  - **Client Obligations** shows the real amount needed for clients
  - **USD Needed** becomes accurate

### Files / systems involved
- **Database migration**
  - remove broken trigger on `usd_inventory_snapshots`
  - if needed, add a small snapshot classification/baseline improvement for safer inventory logic
- **Edge function**
  - `supabase/functions/auto-snapshot-usd/index.ts`
- **Frontend**
  - `src/pages/WalletInventory.tsx`

### Expected result
After this fix:
- your available balance card will stop freezing
- auto spend will reflect in inventory properly
- manual USD spend and USD purchases will refresh immediately
- client needed USD will stay accurate
- the automatic refresh flow will work reliably without this same bug returning

### Technical notes
```text
Current broken flow:
wallet page -> reads snapshot
auto-snapshot-usd tries to upsert
wrong trigger runs
trigger expects NEW.client_id
insert crashes
wallet keeps old balance

Fixed flow:
wallet page -> refresh action or background update
auto-snapshot-usd runs successfully
snapshot saves with correct metrics
wallet reads fresh snapshot
available USD + client obligations + USD needed stay correct
```
