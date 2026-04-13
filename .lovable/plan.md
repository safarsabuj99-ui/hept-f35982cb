

## Plan: Fix Client Balances by Backfilling NULL org_id in Transactions

### Root Cause
441 out of 548 transaction records have `NULL org_id`. These are mostly `auto_spend` debits created by the `auto_debit_on_spend` database trigger, which does not set `org_id`. Since RLS requires `org_id = get_user_org_id(auth.uid())`, these records are invisible to the admin — causing balances to appear inflated (only credits show, debits are hidden).

### Fix — Two Parts

#### 1. Backfill existing NULL org_id transactions
One migration to update all 441 transactions with NULL org_id to the correct agency ID (`a1b2c3d4-e5f6-7890-abcd-ef1234567890`).

```sql
UPDATE public.transactions
SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
WHERE org_id IS NULL;
```

#### 2. Fix `auto_debit_on_spend` trigger to set org_id
The trigger that creates debit transactions from daily spend never sets `org_id`. Update it to copy `org_id` from the campaign record:

```sql
-- In the INSERT statement inside auto_debit_on_spend:
-- Add org_id by looking it up from the campaign
INSERT INTO public.transactions (client_id, type, amount, platform, date, created_by, status, description, org_id)
VALUES (
  v_client_id, 'debit', NEW.spend, v_platform, NEW.data_date,
  v_client_id, 'completed',
  'auto_spend:' || NEW.campaign_id || ':' || NEW.data_date,
  (SELECT org_id FROM public.campaigns WHERE id = NEW.campaign_id)
);
```

### Files Changed
| Action | File |
|--------|------|
| Migration | Backfill 441 NULL org_id transactions + update `auto_debit_on_spend` trigger |

### Expected Result
All client balances will display correctly because both credits and debits will be visible through RLS. Future auto-spend debits will automatically carry the correct org_id.

