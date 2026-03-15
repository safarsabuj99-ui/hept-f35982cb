

## Bug: Cross-Client Campaign Leakage in Shared Ad Accounts

### Root Cause

When an ad account is shared between multiple clients (each with a different `mapping_keyword`), the current UI queries return **all campaigns on that ad account**, not just the ones belonging to the specific client.

The sync function (`sync-deep-dive`) correctly sets `client_id` on each campaign row based on keyword matching. But both `ClientDetail.tsx` and `ClientReports.tsx` query like this:

```typescript
// Current (BROKEN): Gets ALL campaigns on the shared ad account
supabase.from("campaigns")
  .select("id, name, platform, status, ad_account_id")
  .in("ad_account_id", accountIds);
```

This means "musa test" sees campaigns like "Niloy0.2/Rafa2" that belong to a different client (FARISH) simply because they share the same ad account.

### Fix

Add a `.eq("client_id", userId)` filter to campaign queries in both pages. The `client_id` column already exists on the `campaigns` table and is populated correctly by the sync engine.

### Files to Change

| File | Change |
|------|--------|
| `src/pages/ClientDetail.tsx` | Add `.eq("client_id", userId)` to the campaigns query in `loadSpendData()` |
| `src/pages/ClientReports.tsx` | Add `.eq("client_id", effectiveClientId)` to the campaigns query in `fetchData()` |

### Why This Won't Happen Again

The `campaigns` table has `client_id` set by the sync engine via keyword matching. By filtering on `client_id` at query time, even if 10 clients share the same ad account, each client only sees their own campaigns. This is a 2-line fix — one filter added per page.

