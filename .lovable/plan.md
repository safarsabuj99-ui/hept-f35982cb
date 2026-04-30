## You're right — and here's why it works

Today the two sync lanes do different things with the same API spend numbers:

| Lane | Frequency | Writes to | Triggers wallet debit? |
|---|---|---|---|
| **Fast-Lane** | Every few minutes | `daily_ad_spend` only | **No** |
| **Deep-Dive** | Hourly-ish, slower | `daily_metrics` (+ `campaign_performance`) | **Yes** (via `auto_debit_on_spend` trigger) |

The wallet balance comes from `transactions`. `transactions` debits are only created when a row lands in `daily_metrics`. That only happens in Deep-Dive. So:

- Fast-Lane sees fresh spend within minutes — but the wallet doesn't know about it yet.
- Until Deep-Dive runs, balances look **higher than reality**.
- That gap is exactly the "data mismatched with every ad account" symptom you reported yesterday.

Live proof from the DB right now: latest `daily_ad_spend.synced_at` is **30 minutes newer** than latest `daily_metrics.synced_at`. That 30-minute window is when balances are wrong.

Your suggestion — "let Fast-Lane also write the spend so debits happen immediately" — is the correct fix.

## The plan

### 1. Make Fast-Lane the source of truth for *spend-only* debits

For each platform block in `supabase/functions/sync-fast-lane/index.ts` (Meta, Google, TikTok), after we already have the per-day spend rows and a `matchedClientId`, also upsert a minimal row into `daily_metrics`:

- `campaign_id` — resolved from `campaign_mappings` (we already have `campaign_id` from Meta and an equivalent from Google/TikTok). If no campaign row exists yet (new campaign Deep-Dive hasn't seen), skip the metrics write — Deep-Dive will pick it up. This avoids fabricating a campaigns row from Fast-Lane (which lacks objective/status).
- `data_date` — the spend day from the API.
- `spend` — USD-normalized (same conversion Fast-Lane already does for `daily_ad_spend.final_billable_usd`).
- All other metric fields (impressions/clicks/conversions/etc.) — leave at 0 / null. Deep-Dive will overwrite them later with the rich values.
- `org_id` — from `account.org_id`.

Upsert key: `(campaign_id, data_date)` — same key Deep-Dive already uses, so when Deep-Dive runs later it cleanly replaces our zero-filled row with the full metric row.

Crucial: **`auto_debit_on_spend` is an `AFTER INSERT` trigger that already deletes any prior `auto_spend:<campaign>:<date>` debit before inserting the new one** (see the trigger body — it does `DELETE FROM transactions WHERE description = 'auto_spend:...'` then re-inserts). That means when Deep-Dive later upserts the same row with corrected spend, the debit is replaced, not duplicated. So Fast-Lane writing first is **safe and idempotent** by construction.

### 2. Don't break Deep-Dive's richer write

Deep-Dive's existing `daily_metrics` upsert keeps overwriting Fast-Lane's minimal row with the full metric set. The only column both lanes care about is `spend`, and they read it from the same API field, so they agree. No business logic changes anywhere else.

### 3. Skip the metrics write when we can't resolve a campaign row

Fast-Lane today does keyword matching on `campaign_name` to find a client. For the new `daily_metrics` write we additionally need a real `campaigns.id`. Resolution order:

1. Look up `campaigns` by `(ad_account_id, platform_id)` where platform_id is the platform's native campaign id (Meta `row.campaign_id`, Google `campaign.id`, TikTok `row.dimensions.campaign_id`).
2. If not found → skip just the metrics write (still write `daily_ad_spend` as today). Logged as `fast-lane: campaign not yet ingested, deferring metric to deep-dive`. No error, no missing money — Deep-Dive will catch it on its next run, exactly as today.

### 4. Add a one-line balance reconciliation log

After each Fast-Lane account finishes, log `fast-lane: wrote N metric rows, M skipped (no campaign yet)`. Surfaces the case where Deep-Dive falls behind on new campaigns.

### 5. Nothing else changes

- No schema changes.
- No new triggers.
- No change to `daily_ad_spend` writes.
- No change to Deep-Dive code.
- No change to currency conversion, USD/BDT policy, RLS, or wallet attribution rules.
- Pagination fix from the previous plan stays in place.

## Files touched

- `supabase/functions/sync-fast-lane/index.ts` — three small additions (one per platform: Meta, Google, TikTok), each ~10 lines: resolve campaign id, build minimal metric row, batched upsert.

## What this fixes

- Wallet balances reflect spend within Fast-Lane's cadence (minutes), not Deep-Dive's (hourly).
- The 30-minute over-statement gap shown in production right now disappears.
- The original "ad account shows 85.45 but project shows 66.02" class of mismatch is closed at its root.

## What this does NOT do

- Doesn't change historical data — only future syncs.
- Doesn't make Deep-Dive optional. Deep-Dive still owns impressions, clicks, conversions, ROAS, etc. Fast-Lane only touches `spend`.
- Doesn't risk double-debiting — the existing `auto_debit_on_spend` trigger deletes-then-inserts on the same `auto_spend:<campaign>:<date>` key, so repeated upserts of the same (campaign, date) collapse to a single debit equal to the latest spend value.

## Verification after deploy

1. Pick any active client. Note their wallet balance.
2. Wait one Fast-Lane cycle (a few minutes).
3. Re-check the balance. It should drop by the new spend Fast-Lane just observed, *without waiting for Deep-Dive*.
4. After Deep-Dive runs, the balance should not change again for those same (campaign, date) pairs — confirming idempotency.

