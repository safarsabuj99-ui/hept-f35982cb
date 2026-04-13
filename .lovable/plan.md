

## Plan: Fix RLS Violation on `payment_requests` Insert

### Root Cause
The `admin_all_payment_requests` RLS policy requires `org_id = get_user_org_id(auth.uid())` on INSERT, but neither `DepositFundsDialog.tsx` nor `AddFunds.tsx` includes `org_id` in the insert payload. The column has no default value, so it inserts as NULL and fails the policy check.

### Fix

**Best approach**: Create a database trigger that auto-populates `org_id` from the inserting user's profile, so no frontend changes are needed and future insert paths are also covered.

#### 1. Database Migration — Auto-set `org_id` trigger on `payment_requests`
```sql
CREATE OR REPLACE FUNCTION public.set_payment_request_org_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_payment_request_org_id
  BEFORE INSERT ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_payment_request_org_id();
```

#### 2. Also apply to `transactions` table (same pattern)
The `AddFunds.tsx` inserts into `transactions` without `org_id` — add the same trigger there to prevent the same bug.

#### 3. Defensive frontend fix — `DepositFundsDialog.tsx` and `AddFunds.tsx`
Add `org_id` to insert payloads by fetching the user's org from their profile. This is a belt-and-suspenders approach alongside the trigger.

### Files Changed
| Action | File |
|--------|------|
| Migration | Create `set_payment_request_org_id` trigger + same for `transactions` |
| Modify | `src/components/DepositFundsDialog.tsx` — add `org_id` to insert |
| Modify | `src/pages/AddFunds.tsx` — add `org_id` to inserts |

