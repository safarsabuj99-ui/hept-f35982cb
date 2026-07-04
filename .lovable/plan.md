# Fix: Ebrahim can't log in + harden against future email typos

## Root cause
When the HEPT agency created client **Ebrahim (IBR THEARDS)**, the email was saved as `siddiksiddik6823@gmail` — the `.com` is missing. Supabase Auth matches emails exactly, so:

- Login with the real `…@gmail.com` → "invalid credentials" (no such user).
- Password reset from admin succeeded but attached the new password to the broken `…@gmail` record — so login still fails.
- The profile, role (`client`), org link, and `is_active` flag are all fine. The only broken field is the email itself.

Neither the `create-client` edge function nor the `NewClient` form validates the email format beyond the browser's default `type="email"` (which accepts `foo@bar` with no TLD).

## Fix — two parts

### 1. Repair Ebrahim's account (one-off)
- Update the email on `auth.users` for user `2790db53-807b-45bc-916b-07d87f98a980` from `siddiksiddik6823@gmail` → `siddiksiddik6823@gmail.com` using the Supabase admin API (via a short server-side call — not a raw `auth` schema write).
- Re-issue the password the agency already tried to set (or ask the agency to reset once more from the client detail page). Login will then work.
- Write an `audit_logs` entry: `client_email_corrected`.

### 2. Prevent recurrence (root-cause fix)
**Backend — `supabase/functions/create-client/index.ts`**
- Add strict email validation before calling `auth.admin.createUser`:
  - Must match `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` (requires a real TLD).
  - Trim + lowercase before saving.
  - Return `400 { error: "Invalid email format", code: "invalid_email" }` on failure.
- Same guard added to `reset-client-password` is not needed (it uses `user_id`), but we'll add a helper `isValidEmail()` in `_shared/auth.ts` so any future function can reuse it.

**Frontend — `src/pages/NewClient.tsx`**
- Add the same regex check on submit; show an inline field error ("Enter a complete email address, e.g. name@example.com") instead of relying on the browser.
- Trim whitespace on blur so a trailing space doesn't survive.
- Small accessibility touch: bind the error message with `aria-describedby` + `aria-invalid` on the email input so screen readers announce it.

**Admin tool — client detail page**
- Add a small "Correct email" action (admin/platform_owner only) that calls a new tiny edge function `update-client-email` (reuses `requireCaller` + `requireOrgAccess` from `_shared/auth.ts`, calls `auth.admin.updateUserById({ email })`, logs to `audit_logs`). This means the next time a typo slips through, the agency can fix it themselves in 5 seconds without waiting on support.

## Files touched
- `supabase/functions/_shared/auth.ts` — add `isValidEmail()` helper.
- `supabase/functions/create-client/index.ts` — validate + normalize email.
- `supabase/functions/update-client-email/index.ts` — **new**, admin-only email correction.
- `src/pages/NewClient.tsx` — inline validation + a11y attributes.
- `src/pages/ClientDetail.tsx` — "Correct email" button wired to the new function.
- One-off repair call for Ebrahim's account + audit log entry.

## Not touched
- `reset-client-password` — works correctly, no change needed.
- Auth flow, RLS, existing sessions — untouched.

## Verification
1. Re-run login as Ebrahim with `…@gmail.com` → success.
2. Try to create a new client with `foo@bar` → blocked in UI and in edge function.
3. Correct-email button on client detail changes the auth email and audits it.
