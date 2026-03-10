

## Diagnosis: TikTok Sync Data Missing

### What I Found

The TikTok ad account **HEPT AGENCY 3** (ID: `7614979329147109377`) is correctly set up:
- Active, has API token, currency = BDT
- Client assigned with mapping_keyword = "Niloy"
- Integration connection is active

**However**, the sync-fast-lane logs show **zero TikTok processing** -- only 3 Meta accounts appear. This confirms the TikTok reporting API (`/report/integrated/get/`) is returning a non-zero error code (most likely **41000 geo-restriction**), but all 3 sync functions silently swallow the error into an `errors` array without any `console.log` or `console.error`. The error is returned in the HTTP response JSON but never visible in logs.

### Root Cause

The edge function server IP is in a region restricted by TikTok's API. The same geo-block that affected `/advertiser/info/` also blocks `/report/integrated/get/`. **No code change can bypass this** -- it's a TikTok server-side IP restriction.

### Plan: Make Errors Visible + Show in UI

Since we need to confirm the exact error and surface it to you, the plan has 2 parts:

**1. Add `console.error` logging for TikTok API failures in all 3 sync functions**

Files: `sync-fast-lane/index.ts`, `sync-deep-dive/index.ts`, `sync-ad-spend/index.ts`

Before each `errors.push(...)` for TikTok, add:
```typescript
console.error(`TikTok API error for ${account.ad_account_id}:`, json);
```

This will make the actual TikTok error (code + message) visible in the backend function logs.

**2. Surface sync errors as toast notifications in the Settings sync UI**

File: `src/pages/Settings.tsx`

After each sync function call completes, check the response `errors` array. If it contains TikTok-specific errors, show them as warning toasts so you can see exactly what TikTok is returning.

### Important Note

Once we confirm it's error 41000 (geo-restriction), the only real solutions are:
- Running the sync from a non-restricted IP (proxy or different server region)
- Getting TikTok to whitelist the server IP
- Using a different API endpoint if one exists that bypasses the restriction

This plan will give you **clear visibility** into what's failing and why.

