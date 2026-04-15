

## Plan: Fix "record new has no field client_id" Error on Expense Insert

### Problem

The database trigger `trg_set_agency_expenses_org_id` (function `set_org_id_from_auth`) has a fallback branch that references `NEW.client_id`, but the `agency_expenses` table has no `client_id` column. This causes every expense insert to fail.

### Fix

**One migration** to replace the trigger function, removing the `client_id` fallback branch. The `agency_expenses` table is admin-only — `auth.uid()` will always be available, so the fallback is unnecessary.

```sql
CREATE OR REPLACE FUNCTION set_org_id_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
```

### Files Changed

| Action | Detail |
|--------|--------|
| Migration | Replace `set_org_id_from_auth` function to remove invalid `client_id` reference |

No UI changes needed.

