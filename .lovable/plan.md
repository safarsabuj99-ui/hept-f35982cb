

# Fix: Collect Threshold & Next Billing Date from Platform API

## Problem

The `sync-billing-data` edge function silently catches all errors (`catch { /* skip */ }`), so when the `adspaymentcycle` API call fails, there's no visibility into why. Additionally, the function only tries one approach for threshold data, while the auto-import function also extracts threshold info from `funding_source_details` as a fallback.

## Root Cause

1. **Silent error swallowing** — both `try/catch` blocks in `syncMetaBilling` suppress errors with no logging, making it impossible to diagnose failures.
2. **Missing fallback** — the auto-import fetches `funding_source_details` from the account endpoint (which contains threshold type/amount), but `sync-billing-data` doesn't include this field in its initial account-level fetch.
3. **No response debugging** — if the API returns an error response (e.g. permission denied, invalid endpoint), the function treats it as "no data available."

## Changes

### `supabase/functions/sync-billing-data/index.ts`

1. **Add `funding_source_details` to the account-level fetch** (line 15) — this field contains threshold type and amount as a fallback, matching what auto-import already does.

2. **Extract threshold from `funding_source_details`** — if `adspaymentcycle` returns no data, fall back to checking `funding_source_details.type === 2` (threshold account) and `funding_source_details.amount` for the threshold limit.

3. **Add `console.log` for API responses** — log the raw responses from both Meta API calls so failures are visible in edge function logs, replacing the silent `catch { /* skip */ }` blocks.

4. **Log non-OK responses** — when `res.ok` is false, log the status and response body before skipping.

### Specific code changes in `syncMetaBilling`:

**Account-level fetch (line 15):** Add `funding_source_details` to the fields:
```
fields=spend_cap,amount_spent,balance,currency,account_status,funding_source_details
```

Then extract threshold data from `funding_source_details` as fallback:
```typescript
if (data.funding_source_details) {
  const fsd = data.funding_source_details;
  if (fsd.type === 2) {
    result.billing_type = "threshold_postpaid";
    if (fsd.amount) result.threshold_limit = Number(fsd.amount) / 100;
  }
}
```

**Both catch blocks:** Replace `/* skip */` with `console.error(...)` to log failures.

**Non-OK responses:** Log `res.status` and `await res.text()` before skipping.

This is a single-file change to the edge function. No database or frontend changes needed.

