## Problem

For client **Ebrahim** (`user_id: 2790db53-...`):
- `profiles.email` = `siddiksiddik6823@gmail.com` ✅ (correct — what the admin UI displays)
- `auth.users.email` = `siddiksiddik6823@gmail` ❌ (invalid, missing `.com` — what the login system actually checks)

The two got out of sync: at some point the profile row was updated directly (bypassing the `update-client-email` edge function), so the login credential in `auth.users` was never corrected. That's why login only works with the broken address.

## Fix

One-time correction on the auth record so it matches the profile:

1. Call the existing `update-client-email` edge function for `user_id = 2790db53-807b-45bc-916b-07d87f98a980` with `new_email = siddiksiddik6823@gmail.com`. This updates `auth.users.email` (with `email_confirm: true`), writes an audit log entry, and lets the client sign in immediately with the correct address.
2. Verify with a read query that `auth.users.email` and `profiles.email` now match.

No code, schema, or UI changes are needed — the tooling already exists; the auth record just needs to be brought back in sync.

## Note (not part of this fix)

The underlying drift happened because some flow updated `profiles.email` without going through `update-client-email`. If you want, I can follow up separately by auditing which admin form allowed that direct profile edit and locking it down. Say the word and I'll open a separate plan for it.