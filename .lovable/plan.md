## Problem

When an ad account has had **no active campaigns for 10+ days**, the orchestrator marks it as "silent" and stops running Deep-Dive on every cycle (only a 6-hour heartbeat). When the user then turns a campaign back ON, the system does **not** pick up new spend automatically — they must open the ad account and click **Sync** manually.

### Root cause

In `sync-orchestrator/index.ts` (lines 180–196):

1. After 3 consecutive zero-row Fast-Lane runs, the account is flagged "silent".
2. Deep-Dive is then skipped unless 6 h have passed since `last_full_sync_at`.
3. The "activity backstop" in `sync-fast-lane` (line 852) only checks `daily_metrics` for `spend > 0` in the last 3 days — but a freshly reactivated campaign has **no metrics yet**, because Deep-Dive (the function that writes metrics) is the one being skipped. So it's a chicken-and-egg loop until the 6 h heartbeat finally fires.
4. Manual sync works because `SyncControlsAccordion` calls `sync-deep-dive` directly with `manual: true`, bypassing the silent-skip gate entirely.

## Fix

Add two cheap "wake-up" signals so silent accounts re-activate automatically the moment a campaign turns ON — typically within one Fast-Lane cycle (≤ 15 min) instead of up to 6 h.

### 1. Fast-Lane: count campaign-level activity, not just metric rows

In `sync-fast-lane/index.ts` (around line 892–905), expand the "should reset zero_runs" rule to ALSO trigger when:

- The platform API returned **any campaign** with status `ACTIVE`/`ENABLE` for this account in the current run, **or**
- A new `campaigns` row was inserted/updated in the last 24 h for this account.

Currently `shouldReset` is `rows > 0 || isActiveByMetrics`. We add `|| hasActiveCampaign || hasRecentCampaignChange`. This means the first Fast-Lane cycle after reactivation immediately clears `consecutive_zero_runs`, so the next orchestrator tick queues a normal Deep-Dive.

### 2. Orchestrator: shorten the heartbeat for silent accounts

In `sync-orchestrator/index.ts`:

- Lower `HEARTBEAT_HOURS` from **6** → **2** so even if signal #1 misses, a silent account still gets a Deep-Dive every 2 h.
- Add a second escape hatch: if `campaigns` table has any row for this account with `updated_at` in the last 24 h, force a Deep-Dive on this tick regardless of zero-run state.

### 3. UI copy

Update the Sync tab tooltip on the "silent" badge (in `SyncHealthRow`/`SyncAccountsRail`) to read:
> "No active spend detected. We re-check this account every 2 hours and auto-resume the moment a campaign goes live."

## Files touched

- `supabase/functions/sync-fast-lane/index.ts` — add `hasActiveCampaign` + `hasRecentCampaignChange` to the `shouldReset` calc.
- `supabase/functions/sync-orchestrator/index.ts` — `HEARTBEAT_HOURS = 2`, add "recent campaign change" override before the skip-silent branch.
- `src/components/settings/sync/SyncHealthRow.tsx` (or wherever the silent badge tooltip lives) — copy update only.

## Out of scope

- No DB migration. No schema changes.
- No change to the 7-day backfill window or the 30-day manual window agreed earlier.
- No change to Fast-Lane / Deep-Dive frequency for already-active accounts.

## Expected behavior after fix

| Scenario | Before | After |
|---|---|---|
| Campaign reactivated on silent account | Up to 6 h wait, or manual click | Picked up on next Fast-Lane tick (≤ 15 min) |
| Brand-new campaign added | Same as above | Same as above |
| Account stays silent | Heartbeat every 6 h | Heartbeat every 2 h |
| Manual sync | Works (unchanged) | Works (unchanged) |
