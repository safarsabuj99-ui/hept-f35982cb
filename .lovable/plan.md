

## Bug: Meta Balance Shows $0 Despite $10.78 Spend — Cross-Client Debit Misrouting

### Root Cause

The `auto_debit_on_spend()` trigger function finds the client using `ad_account_clients` with `LIMIT 1`:

```sql
-- Line 30-34 of the trigger function — THE BUG
SELECT aac.client_id
INTO v_client_id
FROM public.ad_account_clients aac
WHERE aac.ad_account_id = v_ad_account_id
LIMIT 1;  -- ← picks an ARBITRARY client on shared accounts
```

When multiple clients share the same ad account (each with different `mapping_keyword`), `LIMIT 1` picks whichever client Postgres returns first. The debit transaction gets created for the **wrong client**, so:
- "musa test" has $10.78 Meta spend but $0 Meta balance (debit went to another client)
- The other client gets a phantom debit they didn't incur

The `campaigns` table already has `client_id` set correctly by the sync engine. The trigger should use `campaigns.client_id` directly instead of guessing via the junction table.

### Fix

1. **Update `auto_debit_on_spend()` trigger function** — read `client_id` directly from `campaigns` table instead of `ad_account_clients`:

```sql
-- NEW: Get client_id + platform from campaigns directly
SELECT c.ad_account_id, c.platform, c.client_id
INTO v_ad_account_id, v_platform, v_client_id
FROM public.campaigns c
WHERE c.id = NEW.campaign_id;
```

This eliminates the `ad_account_clients` lookup entirely. Single query, no ambiguity.

2. **Backfill missing/wrong debits** — delete all existing `auto_spend:` transactions and re-create them using the correct `campaigns.client_id`:

```sql
-- Delete all auto_spend debits (they may be assigned to wrong clients)
DELETE FROM public.transactions WHERE description LIKE 'auto_spend:%';

-- Re-insert using campaigns.client_id (correct source of truth)
INSERT INTO public.transactions (client_id, type, amount, platform, date, created_by, status, description)
SELECT DISTINCT ON (dm.campaign_id, dm.data_date)
  c.client_id,
  'debit', dm.spend, c.platform, dm.data_date, c.client_id,
  'completed', 'auto_spend:' || dm.campaign_id || ':' || dm.data_date
FROM daily_metrics dm
JOIN campaigns c ON c.id = dm.campaign_id
WHERE dm.spend > 0 AND c.client_id IS NOT NULL;
```

### Why This Prevents Future Bugs

- The trigger no longer uses `ad_account_clients` at all — it reads `client_id` from `campaigns`, which is the authoritative source set by the sync engine
- No `LIMIT 1` ambiguity — each campaign has exactly one `client_id`
- All three data paths (sync → campaigns, trigger → transactions, UI → balances) use the same `client_id` chain

### Files Changed

| File | Change |
|------|--------|
| Database migration | Update `auto_debit_on_spend()` function + backfill correct debits |

No frontend changes needed — the balance calculation logic in `ClientDetail.tsx` and `ClientWallet.tsx` is correct; it was just operating on misrouted transaction data.

