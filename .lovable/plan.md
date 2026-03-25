

## Problem Diagnosis

The Ad Guard system has **3 critical failures** causing it to not work:

### Root Causes

1. **No automatic execution** — Ad Guard only runs when admin manually clicks "Run Guard Scan." There is no cron job or trigger that automatically checks balances. So if a client's balance goes negative at 2 AM, campaigns keep running until someone manually scans.

2. **Simulated pause only** — The `ad-guard-check` function only sets `campaign_mappings.is_active = false` (a local metadata flag). It does **NOT** call the actual platform APIs (Meta/TikTok/Google) to pause campaigns. Campaigns continue running and spending money on the ad platforms.

3. **`campaigns.status` not updated** — Even locally, the `campaigns` table (which the UI reads) never gets updated to "paused", so campaigns appear active everywhere.

### Additionally
- The `check_auto_resume` trigger exists for auto-resuming on deposits, but there is no corresponding **auto-pause trigger** when debits make balance go negative.
- The `auto_debit_on_spend` trigger fires on every `daily_metrics` insert (creating debit transactions), but nothing checks the resulting balance afterward.

---

## Plan: Bulletproof Ad Guard

### Step 1: Create auto-pause database trigger
Add a trigger on `transactions` table that fires AFTER INSERT on every **debit** transaction. It will:
- Calculate the client's current balance
- If balance <= 0, find all active campaigns for that client (from `campaigns` table where `status` in active statuses)
- Store campaign IDs in `profiles.system_paused_campaigns`
- Set `profiles.guard_paused_at` to now
- Update `campaigns.status` to `'guard_paused'` for all affected campaigns
- Insert audit log with `ad_guard_pause` action type
- This ensures the **instant** a debit pushes balance to 0 or below, campaigns are flagged

**File**: New database migration

### Step 2: Rewrite `ad-guard-check` edge function to call real platform APIs
Instead of just toggling `campaign_mappings.is_active`, the function will:
- For each campaign that needs pausing, call the existing `pause-campaign` logic (Meta/TikTok/Google API calls) to actually stop the campaign on the platform
- Update `campaigns.status` to `'guard_paused'`
- Keep the audit logging and profile updates
- Handle API failures gracefully (log but continue to next campaign)
- Support being called both manually (by admin) and automatically (by cron)
- Remove the admin-only auth check when called by cron (use a secret header instead)

**File**: `supabase/functions/ad-guard-check/index.ts`

### Step 3: Set up cron job for automatic execution
Create a `pg_cron` scheduled job that calls `ad-guard-check` every **5 minutes**. This acts as a safety net in case the trigger missed something or a manual debit was entered.

**Action**: SQL insert via insert tool (pg_cron + pg_net)

### Step 4: Update `isActiveStatus` helper and UI
Add `'guard_paused'` as a recognized paused status so:
- Campaign analytics panels show guard-paused campaigns with a distinct badge
- The toggle switch shows them as OFF
- The AutomationConfigTab resume function updates `campaigns.status` back to `'active'`

**Files**: `src/lib/campaignStatus.ts`, `src/components/AutomationConfigTab.tsx`, `src/components/client-analytics/DeepDiveTable.tsx`

### Step 5: Update auto-resume logic
Modify the `check_auto_resume` trigger to also update `campaigns.status` from `'guard_paused'` back to `'active'` when a deposit brings balance above the threshold. Also invoke the `pause-campaign` function with `action: "enable"` for each resumed campaign.

**File**: Database migration (update `check_auto_resume` function)

### Technical Details

**New trigger (`auto_pause_on_debit`)**:
```text
AFTER INSERT ON transactions
FOR EACH ROW WHEN (NEW.type = 'debit' AND NEW.status = 'completed')
→ Calculate balance
→ If balance <= 0: update campaigns.status = 'guard_paused', set profiles.system_paused_campaigns
```

**Cron schedule**: Every 5 minutes, call `ad-guard-check` via `net.http_post`

**Guard pause flow**:
```text
Debit inserted → Trigger checks balance → Balance ≤ 0?
  YES → Mark campaigns as guard_paused locally
      → Cron picks up within 5 min → Calls platform APIs to pause
  NO  → Do nothing
```

The trigger handles instant local flagging. The cron handles actual platform API calls (which can't be done from a PL/pgSQL trigger).

### Files Changed

| File | Change |
|------|--------|
| New migration | `auto_pause_on_debit` trigger function |
| New migration | Update `check_auto_resume` to handle `guard_paused` status |
| `supabase/functions/ad-guard-check/index.ts` | Rewrite to call real platform APIs, support cron auth |
| `src/lib/campaignStatus.ts` | Add `guard_paused` to status helpers |
| `src/components/AutomationConfigTab.tsx` | Resume updates `campaigns.status`, shows guard_paused badge |
| `src/components/client-analytics/DeepDiveTable.tsx` | Show guard_paused status distinctly |
| SQL insert (pg_cron) | Schedule ad-guard-check every 5 minutes |

