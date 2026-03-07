

# Revamp Ad Guard: Switch from Percentage to Dollar-Amount Trigger

## Current System
- Uses `auto_pause_threshold_pct` (percentage of deposits+overdraft utilized)
- Complex calculation: `(total_debits / (total_deposits + overdraft)) * 100`
- Hard to reason about — clients don't think in percentages

## New System
Replace percentage with a simple dollar balance threshold. When a client's remaining balance drops to or below the configured amount (e.g. $5), all campaigns pause. Also triggers at $0 or negative balance.

**Formula**: `balance = total_deposits - total_debits`. If `balance <= threshold_usd` → pause all campaigns.

## Database Changes

### Migration
- Add column: `auto_pause_balance_usd numeric NOT NULL DEFAULT 5` to `profiles` (the dollar threshold)
- The existing `auto_pause_threshold_pct` column stays for now (no data loss) but will no longer be used

## Code Changes

### 1. `supabase/functions/ad-guard-check/index.ts`
- Replace utilization calculation with simple balance check:
  ```
  balance = totalDeposits - totalDebits
  if (balance <= threshold_usd) → pause campaigns
  ```
- Auto-resume check: resume when `balance > threshold_usd * 2` (double the threshold as safety buffer)

### 2. `src/components/AutomationConfigTab.tsx`
- Remove the percentage `Slider` (80-99%)
- Replace with a USD `Input` field labeled "Pause When Balance Drops To" with default $5
- Keep the overdraft limit input
- Keep manual resume and "Run Ad Guard Now" buttons
- Save writes to `auto_pause_balance_usd` instead of `auto_pause_threshold_pct`

### 3. Database trigger `check_auto_resume()`
- Update the trigger function to use balance-based logic instead of percentage:
  ```sql
  IF v_balance > v_pause_threshold * 2 AND paused campaigns exist → resume
  ```

### 4. `src/components/RunwayPrediction.tsx`
- Update to read `auto_pause_balance_usd` instead of `auto_pause_threshold_pct`

| File | Change |
|------|--------|
| Migration | Add `auto_pause_balance_usd` column to `profiles` |
| Migration | Update `check_auto_resume()` trigger function |
| `supabase/functions/ad-guard-check/index.ts` | Balance-based pause logic |
| `src/components/AutomationConfigTab.tsx` | Dollar input instead of percentage slider |
| `src/components/RunwayPrediction.tsx` | Read new column |

