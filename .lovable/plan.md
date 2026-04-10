

## Fix: Ad Accounts Not Visible on Agency Detail (RLS Gap)

### Root Cause

The `ad_accounts` and `ad_account_clients` tables have **no RLS policy for the `platform_owner` role**. When the platform owner views the Agency Detail page, the query `supabase.from("ad_accounts").select("id").eq("org_id", agencyId)` returns zero rows because RLS silently filters them out.

The data is correct — all 9+ ad accounts have `org_id = 'a1b2c3d4-...'` — but the platform owner simply cannot read them.

### Fix

**Database migration** — Add `platform_owner` ALL policies to both tables:

```sql
CREATE POLICY "platform_owner_all_ad_accounts"
  ON public.ad_accounts FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));

CREATE POLICY "platform_owner_all_ad_account_clients"
  ON public.ad_account_clients FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));
```

No frontend code changes needed — the existing query already works correctly, it's just blocked by RLS.

### Files Changed
- 1 database migration (two CREATE POLICY statements)

