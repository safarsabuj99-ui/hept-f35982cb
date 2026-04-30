## Change auto-snapshot-usd schedule to every 30 minutes

### What changes
The cron job currently named `auto-snapshot-usd-5min` runs the `auto-snapshot-usd` edge function every 5 minutes. We'll reschedule it to run every 30 minutes instead.

### Why it's safe
- This function recomputes USD inventory snapshots (carry-forward, burn rate, client obligations) per organization.
- It uses idempotent upsert on `(snapshot_date, org_id)` and never overwrites manual baselines, so a slower cadence does not corrupt data.
- USD inventory data does not change second-to-second — it shifts when purchases, daily metrics, or manual spends are recorded. A 30-minute refresh is more than fresh enough for the dashboard widgets that consume it.
- Reduces edge function invocations from 288/day to 48/day for this job (~83% drop on this task).

### Technical implementation
Run a SQL update that:
1. Unschedules the existing 5-minute job.
2. Re-schedules it under a new name `auto-snapshot-usd-30min` with cron expression `*/30 * * * *`, calling the same edge function URL with the same headers/body as today.

Since the cron job contains the project URL and anon key, this will be executed via the Supabase insert tool (not a versioned migration), matching the project's existing pattern for cron jobs.

### Verification
After applying:
- Query `cron.job` to confirm the old `auto-snapshot-usd-5min` is gone and `auto-snapshot-usd-30min` exists with schedule `*/30 * * * *`.
- Check `cron.job_run_details` after ~35 minutes to confirm a successful run.
- Confirm `usd_inventory_snapshots` for today still updates (non-manual rows) on the new cadence.

### Not changed
- The edge function code itself (`supabase/functions/auto-snapshot-usd/index.ts`) is untouched.
- All other cron jobs (orchestrators, queue workers, ad-guard, billing-radar, lifecycle, etc.) keep their current schedules.
