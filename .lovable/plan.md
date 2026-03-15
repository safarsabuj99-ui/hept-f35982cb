

## Plan: Always Show All Platform Rates in Payment Approval Modal

### Problem

When approving a client-side payment request, the rate picker only shows rates that exist in the client's `pricing_config.flat_rates`. If a client has no platform rates configured, only a single "Default Rate ৳120" appears (screenshot 2). But when the admin creates a deposit from client details for a client with all rates set, all 3 platform options show (screenshot 1).

The user wants the **same experience for both** — always show Meta, TikTok, and Google rate options.

### Root Cause

In `openConfirm()` (line 170-175), rate options are only added if `platformRates.meta`, `.tiktok`, `.google` exist. If none exist, a single "Default Rate" at 120 is pushed. This means clients without configured rates get a degraded UI.

### Fix

**File: `src/pages/PaymentRequests.tsx`** — `openConfirm()` function (lines 170-180)

Change the rate options builder to **always show all 3 platform rates**, using the client's configured rate if available, otherwise falling back to 120:

```typescript
const options: RateOption[] = [
  { key: "meta", label: "Meta Rate", rate: Number(platformRates.meta) || 120 },
  { key: "tiktok", label: "TikTok Rate", rate: Number(platformRates.tiktok) || 120 },
  { key: "google", label: "Google Rate", rate: Number(platformRates.google) || 120 },
];
```

Remove the `if (options.length === 0)` fallback since we always have 3 options now. The auto-select logic for matching the request's platform stays the same.

### Files to Change
- `src/pages/PaymentRequests.tsx` — 1 small change in `openConfirm()`

