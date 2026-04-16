

## Plan: Fix Ad Guard 401 Auth Failure + Make Platform Pause Actually Work

### Root Cause

The cron job (every 2 minutes) calls `ad-guard-check` with the **anon key** as Bearer token. The function checks `Deno.env.get("SUPABASE_ANON_KEY")` — but **this env var doesn't exist** in Supabase Edge Functions. Only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are available.

Result: `anonKey = ""`, comparison fails, `auth.getUser(anonKey)` fails → **401 on every single cron invocation**. The 4 guard_paused campaigns for Fahim have been sitting in the queue since 15:02 with zero pause attempts — the platform API was never called.

### Fix

#### 1. Fix auth in `ad-guard-check` (the critical fix)

Decode the JWT payload to detect anon/service_role tokens instead of relying on the missing env var:

```typescript
let isTrustedCall = token === serviceRoleKey;
if (!isTrustedCall) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.role === 'anon' || payload.role === 'service_role') {
      isTrustedCall = true;
    }
  } catch {}
}
```

#### 2. Make Phase 2 immediately attempt pause (not just queue)

Currently Phase 2 only sets `guard_paused` and inserts a queue entry. The actual API call only happens on the **next** cron cycle (Phase 1). This wastes 2+ minutes.

Change: After queuing, immediately call `pause-campaign` inline for each campaign in the same run. If the inline call succeeds, skip the queue entry entirely.

#### 3. Add admin notification on guard activation

When campaigns are guard-paused, insert a notification so admins are alerted immediately.

#### 4. Deploy and process the stuck jobs

After deploying the fixed function, the next cron run will process the 4 pending jobs for Fahim and actually call the TikTok API to pause them.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/ad-guard-check/index.ts` | Fix auth (JWT decode), inline pause attempts in Phase 2, add admin notification |

### Result

- Cron will no longer 401 — guard checks will actually execute
- Campaigns will be paused on the ad platform within the same guard run (not deferred)
- Fahim's 4 TikTok campaigns will be paused on the next cron cycle (~2 min)
- Admins get notified when guard activates

