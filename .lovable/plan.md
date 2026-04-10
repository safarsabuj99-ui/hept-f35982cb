

## Fix: Agency Detail Shows No Data (org_id is NULL)

### Root Cause

All client profiles and ad accounts have `org_id = NULL`. The AgencyDetail page filters by `org_id = agencyId`, so it finds only the admin user — zero clients, zero ad accounts, zero managers.

This happened because clients and ad accounts were created before multi-tenancy was added, and `org_id` was never backfilled.

### Fix (Two Parts)

#### 1. Database Migration: Backfill org_id

Since there's only one organization (`MD SABUJ MIAH Agency` = `a1b2c3d4-e5f6-7890-abcd-ef1234567890`), backfill all NULL `org_id` values:

```sql
-- Backfill profiles
UPDATE profiles SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
WHERE org_id IS NULL;

-- Backfill ad_accounts
UPDATE ad_accounts SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
WHERE org_id IS NULL;

-- Backfill ad_account_clients
UPDATE ad_account_clients SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
WHERE org_id IS NULL;

-- Backfill transactions, payment_requests, campaigns, etc.
UPDATE transactions SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE payment_requests SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE campaigns SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE daily_ad_spend SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE daily_metrics SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE campaign_performance SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE campaign_mappings SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE billing_notifications SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE audit_logs SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE notifications SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE client_notices SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE agency_accounts SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE agency_expenses SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE api_integrations SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE campaign_requests SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE fund_transfers SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE liquid_fund_entries SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE cash_withdrawals SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
UPDATE cash_withdrawal_returns SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE org_id IS NULL;
```

#### 2. Future-Proof: Auto-Set org_id on New Records

Update `src/pages/CreateAgency.tsx` — when creating a client via the admin panel (`NewClient`, `create-client` edge function), ensure `org_id` is always set. Check the `create-client` edge function to verify it sets `org_id` on the new profile.

Also update `src/pages/AdAccounts.tsx` (or wherever ad accounts are created) to always pass `org_id`.

### Result

After backfill, the AgencyDetail page will correctly show all clients, ad accounts, and managers because `profiles.org_id` and `ad_accounts.org_id` will match the agency ID.

### Files Changed
- Database migration — backfill all NULL org_id values
- `supabase/functions/create-client/index.ts` — verify org_id is set (likely already done, just confirm)

