

## Plan: Fix Trial Settings Not Persisting + Signup Ignoring Trial Mode

### Root Cause Analysis

**Bug 1 — Trial toggle resets on reload:**
The `settings` table RLS policy only allows the `admin` role to update rows. Platform owners have the `platform_owner` role, so when they toggle "Trial on Self-Signup" ON and save, the database update silently returns 0 rows affected. The UI shows success, but the DB still holds `"false"`. On reload, it reads the unchanged value.

**Bug 2 — Signup always requires payment:**
The `Signup.tsx` page has a hardcoded 4-step flow (Plan → Details → **Payment** → Confirmation). It never reads the `trial_on_self_signup` setting from the database, so even if the setting were correctly saved, the signup form would still force users through the payment step.

### Fix

#### 1. Database Migration — Fix RLS Policy
Update the settings update policy to also allow `platform_owner` role:

```sql
DROP POLICY "admin_write_settings" ON public.settings;
CREATE POLICY "admin_or_platform_write_settings" ON public.settings
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'platform_owner'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'platform_owner'::app_role)
  );
```

#### 2. Modify `src/pages/Signup.tsx` — Trial-Aware Signup Flow
- On mount, fetch `trial_on_self_signup` from the `settings` table
- If trial mode is ON:
  - Change steps to 3: "Select Plan" → "Account Details" → "Confirmation" (skip Payment)
  - Submit directly after step 2 validation (no payment fields required)
  - The `self-signup` edge function already handles trial mode correctly (it checks the setting and skips payment validation)
- If trial mode is OFF: keep current 4-step flow with payment

#### 3. Modify `src/pages/PlatformPlans.tsx` — Add Save Feedback
- After `saveTrialSettings`, check if the update actually affected rows
- Show an error toast if the update failed (defensive, since the RLS fix should resolve it)

### Files Changed

| File | Change |
|------|--------|
| Migration | Fix RLS policy on `settings` to include `platform_owner` |
| `src/pages/Signup.tsx` | Fetch `trial_on_self_signup`, conditionally skip payment step |
| `src/pages/PlatformPlans.tsx` | Add error handling on save |

