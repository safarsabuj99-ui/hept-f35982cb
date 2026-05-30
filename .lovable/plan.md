## Bug
`usd_inventory_snapshots` has a unique constraint on `(snapshot_date, org_id)`. Closing the period (and setting opening balance) does a plain `INSERT` with today's date, so if a snapshot for today already exists (auto-snapshot cron, earlier close, or earlier opening-balance set), the insert fails with `duplicate key value violates unique constraint "usd_inventory_snapshots_date_org_unique"`.

## Fix
In `src/pages/WalletInventory.tsx`, switch both writers from `.insert(...)` to `.upsert(..., { onConflict: "snapshot_date,org_id" })` so re-running on the same Dhaka day overwrites today's snapshot instead of erroring:

- `handleClosePeriod` (line 380) — upsert today's row with the entered carry-forward balance and notes.
- `handleSetOpeningBalance` (line 355) — same pattern, so re-setting an opening balance the same day also works.

No schema, RLS, or business-logic change. The unique constraint stays (one snapshot per day per org is still correct); upsert simply makes the same-day re-save idempotent, matching the UI copy "saves the carry-forward balance as a new snapshot".

After the change: closing the period on a day that already has a snapshot updates that snapshot in place, the success toast fires, and the dialog closes cleanly.
