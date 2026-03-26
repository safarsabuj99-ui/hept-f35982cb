

## New Ad Guard System — Complete Rebuild

### Problems with Current System

1. **Threshold logic is broken**: When overdraft is 0 (most clients), `effectiveThreshold` becomes 0 instead of using the configured `auto_pause_balance_usd`. So if you set $5 threshold, it only triggers at $0.
2. **Transaction query hits 1000-row limit**: Fetches ALL transactions without filtering — Supabase returns max 1000 rows, so balance calculations are wrong for active clients.
3. **DB trigger can't call platform APIs**: The `auto_pause_on_debit` trigger marks campaigns locally but the cron (every 5 min) must pick them up to actually pause on Meta/TikTok/Google — a 5-minute gap where money is being spent.
4. **New campaigns missed**: If `system_paused_campaigns` already has entries, new active campaigns are skipped entirely.
5. **Campaign details fetched from wrong table**: UI fetches from `campaign_mappings` instead of `campaigns`.

### New Architecture — 3-Layer Protection

```text
Layer 1: DB Trigger (instant, on every debit)
  → Calculates balance using SUM aggregation (no row limit)
  → Uses the ACTUAL configured threshold (not 0)
  → Flags campaigns as guard_paused
  → Flags profile with system_paused_campaigns

Layer 2: ad-guard-check Edge Function (every 5 min via cron)
  → Picks up ALL guard_paused campaigns and calls platform APIs
  → Also catches any active campaigns that should be paused
  → Uses SQL SUM for balance (not client-side filtering)
  → Tracks per-campaign API results with retry logic

Layer 3: Auto-resume trigger (on deposit)
  → When credit brings balance above 2× threshold
  → Clears guard state and calls platform APIs to re-enable
```

### Step 1: Fix the DB Trigger — `auto_pause_on_debit`

**Migration**: Drop and recreate the function with corrected threshold logic:

- **Fix**: Always use `auto_pause_balance_usd` as the threshold (default $5), regardless of overdraft setting. Overdraft just allows the balance to go negative before pausing.
- **Formula**: `effective_threshold = threshold + overdraft`. If threshold=$5, overdraft=$0, pause at $5. If threshold=$5, overdraft=$10, pause at $-5.
- Finds ALL active campaigns (not just ones not already in `system_paused_campaigns`) and adds any new ones.

### Step 2: Rewrite `ad-guard-check` Edge Function

Complete rewrite with these improvements:

- **Balance via SQL**: Use `SELECT SUM(CASE...) FROM transactions WHERE client_id = X` per client instead of fetching all transactions client-side.
- **Correct threshold**: Same formula as trigger — `threshold + overdraft` defines the pause point.
- **Process guard_paused campaigns first**: Find all campaigns with `status = 'guard_paused'` and call platform APIs immediately, regardless of which client they belong to.
- **Catch stragglers**: Then scan all clients, recalculate balances, and catch any active campaigns that should be paused.
- **Per-campaign error tracking**: Log individual API failures in audit_logs instead of silently catching.
- **Simplified auth**: Accept service role key OR anon key (cron) OR admin JWT.

### Step 3: Fix `check_auto_resume` Trigger

**Migration**: Update the function:
- Use the same threshold formula: `threshold + overdraft`
- Resume when balance > threshold (not 2× threshold — simpler and more predictable)
- Update `campaigns.status` from `guard_paused` to `active`

### Step 4: Fix UI — AutomationConfigTab

- Fetch paused campaign details from `campaigns` table (not `campaign_mappings`)
- Fix threshold description to accurately reflect the new logic
- Remove the confusing "resume window" concept — campaigns stay paused until balance is restored or admin manually resumes. Simpler = fewer bugs.

### Step 5: Update `campaignStatus.ts`

Already has `isGuardPaused` — no changes needed.

### Files Changed

| File | Change |
|------|--------|
| New migration | Rewrite `auto_pause_on_debit` with correct threshold: `balance <= threshold + overdraft` |
| New migration | Update `check_auto_resume` with matching threshold logic |
| `supabase/functions/ad-guard-check/index.ts` | Full rewrite: SQL-based balance, correct threshold, process guard_paused campaigns first |
| `src/components/AutomationConfigTab.tsx` | Fetch from `campaigns` table, simplify threshold display |

### Threshold Logic (the core fix)

```text
Example: Client has threshold=$5, overdraft=$0
→ Pause when balance ≤ $5 ✓

Example: Client has threshold=$5, overdraft=$10  
→ Pause when balance ≤ $5 - $10 = -$5
→ Client can spend down to -$5 before guard activates

Example: Client has threshold=$0, overdraft=$0
→ Pause when balance ≤ $0 (only at zero)
```

