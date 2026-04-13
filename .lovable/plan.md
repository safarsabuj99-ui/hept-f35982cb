

## Plan: Fix Trial Mode Not Detected on Signup Page

### Root Cause

The `settings` table has an RLS SELECT policy restricted to `authenticated` users only. The Signup page is accessed by **unauthenticated** visitors (anon key), so the query to fetch `trial_on_self_signup` returns nothing. The trial toggle stays `false` and the payment step always shows.

### Fix (2 changes)

#### 1. Database Migration — Allow Anon Read on Settings
Add a SELECT policy for the `anon` role so unauthenticated pages can read settings:

```sql
CREATE POLICY "anon_read_settings" ON public.settings
  FOR SELECT TO anon USING (true);
```

This is safe — the `settings` table holds non-sensitive configuration values (trial days, grace period, toggle flags). Write access remains restricted to authenticated admins/platform owners.

#### 2. No Code Changes Needed
The Signup page already has the correct logic:
- Fetches `trial_on_self_signup` on mount (line 63)
- If `"true"`, sets `trialMode = true` → skips Payment step, submits after Account Details
- The `self-signup` edge function already handles trial mode (reads the setting server-side and skips payment validation)

Once anon users can read the setting, everything works end-to-end:
1. Platform owner enables trial → saved to DB (already working after RLS fix)
2. New user visits Signup → reads setting → sees 3 steps (no payment)
3. Submits → edge function creates org with `trial` status
4. Trial expires → SubscriptionGate blocks access → user upgrades with payment

One migration, zero code changes.

