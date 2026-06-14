# Fix: "Today's Spend" Shows $0 Even Though Sync Is Working

## What's actually happening

The sync is **not broken**. Data is being pulled from Meta and TikTok every 15 minutes — last successful run was a few minutes before your screenshot. Proof from the database right now:

- `daily_ad_spend` for **2026-06-15** (today, Dhaka) → 17 rows, **$6.44** ✅ data arrived
- `daily_metrics` for **2026-06-15** (today, Dhaka) → **0 rows** ❌ empty
- `daily_metrics` for **2026-06-14** → 89 rows, $260.12

The dashboard KPI **reads from `daily_metrics`, not `daily_ad_spend`**, so it correctly returns `$0` for today.

## Root cause

It's a **timezone mismatch**, not an API failure.

- Your screenshot was taken at **Dhaka 05:00 AM on 2026-06-15**, which is **UTC 23:00 on 2026-06-14**.
- The dashboard sends `p_date_from = 2026-06-15` (Dhaka calendar day) to `get_admin_dashboard_summary`.
- But the Meta / TikTok / Google APIs return each spend row tagged with the **ad account's own timezone** (usually UTC or PST). At 23:00 UTC, those platforms still report the row as `date = 2026-06-14`.
- So `daily_metrics.data_date` gets `2026-06-14`, and the query for `data_date = 2026-06-15` finds nothing.
- A second code path (the "rolling days" writer that fills `daily_ad_spend`) already uses **Dhaka calendar date** — that's why `daily_ad_spend` has today's row but `daily_metrics` doesn't.

Every morning between **Dhaka 00:00 and ~06:00**, the dashboard will keep showing `$0` for "Today" until the platforms' own clocks tick over to the new day. This has been silently wrong for months.

## The fix (one focused change, no UI changes)

Normalise `data_date` to the **Dhaka calendar day at the moment of sync** when the sync is writing the rolling "today" window. Historical backfills keep using the platform-reported date so old reports don't shift.

### Files to change

1. **`supabase/functions/sync-fast-lane/index.ts`**
   - The fast-lane only ever syncs today/yesterday rolling spend.
   - Replace `data_date: it.date` (Meta/TikTok/Google branches around lines 131, 426, 547, 800) with the helper that returns Dhaka-today: `dhakaToday()` (already defined at line 75).
   - Same change for the `daily_ad_spend` writes that already use this helper — keep them consistent.

2. **`supabase/functions/sync-deep-dive/index.ts`**
   - Only normalise when the row being written is for the rolling current day (`dataDate === platformReportedToday`). Past-day rows must keep the platform-reported `data_date` to preserve historical accuracy.
   - Touches the three `daily_metrics` upsert blocks (Meta line 417, Google line 803, TikTok line 1206-ish).

3. **One-time backfill migration**
   - Copy today's rows from `daily_ad_spend` (which already has correct Dhaka dates) into `daily_metrics` so the dashboard recovers immediately without waiting for the next sync cycle:
     ```sql
     INSERT INTO daily_metrics (campaign_id, data_date, spend, synced_at, ...)
     SELECT c.id, das.date, das.final_billable_usd, now(), ...
     FROM daily_ad_spend das
     JOIN campaigns c ON c.ad_account_id = das.ad_account_id AND c.original_name_tag = das.campaign_name
     WHERE das.date = (now() AT TIME ZONE 'Asia/Dhaka')::date
     ON CONFLICT (campaign_id, data_date) DO NOTHING;
     ```
   - Exact column list will be confirmed against the table before running.

### What does NOT change

- No frontend / UI changes.
- No change to historical data — only the rolling "today" row gets a Dhaka-aligned date going forward.
- API tokens, RLS, sync schedule, edge function deployment cadence — all untouched.

## How we verify the fix

1. Deploy `sync-fast-lane` + `sync-deep-dive`.
2. Run the one-time backfill SQL.
3. Refresh the admin dashboard → "Today's Spend" should immediately show the actual USD figure (currently ~$6.44 and growing).
4. Tomorrow morning at Dhaka 00:30, check again — it should show a small non-zero figure instead of $0.

## Risk

Low. The only behavioural change is a date label on the rolling-today row in `daily_metrics`. The wallet-debit trigger (`auto_debit_on_spend`) keys off `(campaign_id, data_date)` and will simply attribute spend to the Dhaka day, which matches how revenue/collections are already counted — actually **more** consistent than today.
