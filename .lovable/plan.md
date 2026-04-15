

## Plan: Fix BDT Currency Conversion in TikTok/Google Sync & Repair Data

### Problem
The `sync-fast-lane` edge function handles BDT→USD conversion correctly for **Meta** (lines 251-253) but **TikTok** and **Google** sections hardcode `exchange_rate_used: 1` and `final_billable_usd: spend` — storing BDT amounts as if they were USD.

- **164 rows** in `daily_ad_spend` are affected (all from 2 TikTok BDT accounts)
- Total recorded: **$88,067** — actual USD value: **~$740** (÷119)
- Per-account `exchange_rate` is already set (119) — no need for Google currency API

### Actions

**1. Fix sync-fast-lane TikTok section** (lines 512-523)
Apply the same BDT conversion logic already used in Meta:
```typescript
const isBDT = currency === "BDT";
const accountRate = isBDT ? (account.exchange_rate ?? 1) : 1;
const finalUsd = isBDT ? Math.round((spend / accountRate) * 100) / 100 : spend;
// use accountRate and finalUsd in the record
```

**2. Fix sync-fast-lane Google section** (lines 354-365)
Same fix as TikTok.

**3. Repair existing corrupted data** (SQL migration)
```sql
UPDATE daily_ad_spend das
SET exchange_rate_used = aa.exchange_rate,
    final_billable_usd = ROUND(das.raw_spend_amount / aa.exchange_rate, 2)
FROM ad_accounts aa
WHERE das.ad_account_id = aa.id
  AND das.raw_currency = 'BDT'
  AND das.exchange_rate_used = 1;
```
This uses each account's actual `exchange_rate` rather than a hardcoded value.

**4. Re-trigger `auto-snapshot-usd`** to refresh wallet metrics.

### Files Changed

| Action | Detail |
|--------|--------|
| Modify | `supabase/functions/sync-fast-lane/index.ts` — add BDT conversion to TikTok + Google sections (matching Meta logic) |
| Migration | Fix 164 `daily_ad_spend` rows using per-account exchange rate |
| Test | Invoke `auto-snapshot-usd` to verify corrected balance |

### Prevention
After this fix, all three platforms use identical per-account `exchange_rate` logic. Any future BDT account on any platform will automatically convert correctly — no external currency API needed.

