

## Root Cause Found

The Ad Guard system **correctly marks campaigns as `guard_paused` in the database**, but **never actually pauses them on the ad platforms** (Meta/TikTok/Google). Here's why:

### The Bug

`ad-guard-check` calls `pause-campaign` with `Authorization: Bearer ${serviceRoleKey}` (line 114). But `pause-campaign` validates this token as a **user JWT** via `supabase.auth.getUser(token)` (line 90). The service role key is NOT a user JWT — so `getUser()` returns an error, and `pause-campaign` returns **401 Unauthorized**.

Back in `ad-guard-check`, the error is caught silently (line 126-128), and the code continues to mark campaigns as `guard_paused` locally — but **no platform API call was ever made**. The campaigns keep running on Meta/TikTok/Google.

This is confirmed by the edge function logs: `ad-guard-check` boots but `pause-campaign` has **zero logs** — it's rejecting at the auth gate before logging anything useful.

### Fix

Update `pause-campaign` to recognize the **service role key** as a valid server-to-server caller, bypassing user auth and permission checks when called internally by `ad-guard-check`.

### Implementation

**File: `supabase/functions/pause-campaign/index.ts`** — Lines 89-155

Replace the auth block to add service role key detection:

```typescript
const token = authHeader.replace("Bearer ", "");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
let user: any = null;
let isServiceCall = false;

if (token === serviceRoleKey) {
  // Internal server-to-server call (from ad-guard-check, cron, etc.)
  isServiceCall = true;
} else {
  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !caller) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  user = caller;
}
```

Then update the permission checks to skip when `isServiceCall` is true:

```typescript
// Permission check — skip for service calls (ad-guard, cron)
if (!isServiceCall) {
  const { data: roleData } = await supabase
    .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  const isAdmin = !!roleData;

  if (isEnableAction && !isAdmin) { /* ... reject ... */ }
  if (!isAdmin) { /* ... ownership check ... */ }
}
```

Also skip the "already paused" check for `guard_paused` status — when ad-guard calls pause, the DB trigger may have already set `guard_paused`, but the platform API still needs to be called:

```typescript
// Don't reject guard_paused campaigns when service is trying to pause on platform
if (!isEnableAction && normalizedStatus === "paused" && !isServiceCall) {
  return new Response(JSON.stringify({ error: "Campaign is already paused." }), ...);
}
```

And treat `guard_paused` as needing a platform pause (not already paused):

```typescript
const normalizedStatus = campaign.status.toLowerCase() === "enable" ? "active"
  : campaign.status.toLowerCase() === "disable" ? "paused"
  : campaign.status.toLowerCase() === "guard_paused" ? "active" // Still needs platform pause
  : campaign.status;
```

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/pause-campaign/index.ts` | Add service role key auth bypass, skip permission checks for internal calls, treat `guard_paused` as needing platform pause |

This is a single-file fix. No database changes needed.

