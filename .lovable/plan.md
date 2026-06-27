# Why the "Failed to enable" error appears

The toast says *"Edge Function returned a non-2xx status code"* — that's a generic message because the frontend never reads the real error body from the edge function.

Looking at the actual edge function logs for `pause-campaign`, the underlying Meta API response is:

```
HTTP 400 — OAuthException 100 / subcode 2490392
"You must also select Instagram Explore"
"To place ads in Instagram Explore home, please also select Instagram Explore."
```

**This is NOT a bug in our SaaS.** Meta is rejecting the resume request because the campaign's ad set has `instagram_positions = ["explore_home"]` but is missing `"explore"`. Meta now requires both placements together. Until that placement is fixed inside Meta Ads Manager, **any** attempt (from our app, from Ads Manager itself, or via API) to set the campaign back to ACTIVE will fail.

The problem on our side is only that we hide this useful message behind a generic toast, so you can't tell whether it's our app or the platform that needs fixing.

## Smart, future-proof fix

### 1. Edge function — return platform error details with 200 status

In `pause-campaign/index.ts`, when the platform API rejects the change, return:

```json
{
  "success": false,
  "platform_error": true,
  "platform": "meta",
  "error_code": 2490392,
  "error_title": "You must also select Instagram Explore",
  "error_message": "To place ads in Instagram Explore home, please also select Instagram Explore.",
  "action_hint": "Fix the ad set placements in Meta Ads Manager, then try again."
}
```

with HTTP **200** (not 502). Reason: when an edge function returns non-2xx, `supabase.functions.invoke` strips the body and only gives the generic "non-2xx" string — that's why you see the unhelpful toast. Returning 200 + a structured `success: false` payload lets us show the real reason.

Add a small **known-error mapper** so platform-specific subcodes (Meta 2490392 placements, 1487749 budget, 1885183 spend-cap, TikTok 40105 balance, Google policy errors, etc.) get a friendly explanation + a "Fix in Ads Manager" link.

### 2. Frontend — show the real reason

In `DeepDiveTable.tsx` (3 invoke sites) and `AutomationConfigTab.tsx`, replace:

```ts
if (error) toast.error("Failed to enable");
```

with:

```ts
if (error || result?.success === false) {
  toast.error(result?.error_title || "Cannot enable campaign", {
    description: result?.error_message || error?.message,
    duration: 8000,
  });
}
```

### 3. Prevent this class of bug from recurring

- **Shared error helper** `supabase/functions/_shared/platformError.ts` — every sync / pause / enable function uses one mapper so new platform errors automatically get readable messages.
- **Pre-flight read** before enable on Meta: call `effective_status` + `issues_info` first; if `issues_info` is non-empty, show the issue *before* sending the write, so the user never sees a confusing failure.
- **Audit log entry** `platform_validation_error` so admins can see a history of campaigns Meta rejected (and why), making patterns easy to spot.

## Files to change

- `supabase/functions/pause-campaign/index.ts` — return structured error, add Meta `issues_info` pre-check.
- `supabase/functions/_shared/platformError.ts` — new shared mapper.
- `src/components/client-analytics/DeepDiveTable.tsx` — read `result.error_title` / `error_message` in all 3 invoke handlers.
- `src/components/AutomationConfigTab.tsx` — same toast upgrade.

## What you should do for this specific campaign

Open Meta Ads Manager → edit the ad set under **Kowsik/Royal/Sahara/CBO/A+** (or whichever one you tried to enable) → **Placements** → tick **Instagram Explore** in addition to **Instagram Explore home** → Save → then retry "Enable" in HEPT.

Used the accessibility skill (toasts will now include descriptions + longer dwell time so screen-reader users actually catch the reason).
