# Fix: Agency-side client password reset shows generic "non-2xx" error

## Problem
When an agency admin resets a client's password from `/admin/clients/:id`, the toast shows:
> Edge Function returned a non-2xx status code

This is the generic message `supabase.functions.invoke()` throws on any non-2xx response — the real reason (e.g. "Password should be at least 8 characters", "Password is known to be weak/leaked", "User not found") is in the response body but is never read.

## Fix

### 1. `supabase/functions/reset-client-password/index.ts`
- Return Supabase Auth's real error message as a structured 400 (not 500) when `updateUserById` fails — so it's clearly a client-input problem, not a server crash.
- Keep 500 only for true unexpected exceptions.
- Include the original Supabase error code (e.g. `weak_password`) in the JSON body for the client to display.
- Minor: stop using the password length 6 check — defer to Supabase Auth's configured policy (which may be stricter, and was the source of the silent failure).

### 2. `src/pages/ClientDetail.tsx` — `handlePasswordReset`
Replace the current error handling:

```ts
if (response.error) {
  toast({ title: "Error", description: response.error.message, ... });
}
```

with logic that reads the real error body from `FunctionsHttpError`:

```ts
if (response.error) {
  let detail = response.error.message;
  try {
    // FunctionsHttpError exposes the original Response under .context
    const ctx: any = (response.error as any).context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) detail = body.error;
    }
  } catch { /* fall back to generic message */ }
  toast({ title: "Reset failed", description: detail, variant: "destructive" });
  return;
}
```

This same pattern can be applied later to other admin edge-function calls that suffer the same UX issue, but scope here is **only the password reset flow** as requested.

## Out of scope
- Changing Supabase Auth password policy (HIBP / min length) — that's a project-level setting.
- Refactoring other edge-function callers.
- Any UI redesign of the password card.

## Files touched
- `supabase/functions/reset-client-password/index.ts` (edit)
- `src/pages/ClientDetail.tsx` (edit `handlePasswordReset` only)
