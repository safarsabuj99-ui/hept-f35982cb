

# Per-Client Sync Start Date at Creation Time

## Current State

The system already has a `data_fetch_start_date` column on the `profiles` table and the `sync-deep-dive` function already reads it per-client. However:

1. **NewClient form** does not expose a date picker for setting this value at creation time.
2. **create-client edge function** does not accept or save `data_fetch_start_date`.
3. **sync-fast-lane** ignores per-client start dates entirely -- it uses only the global `sync_start_date` setting for all accounts.
4. The deep-dive start date logic has a bug: the loop that computes `effectiveStartDate` is contradictory (lines 99-106) and may not pick the correct per-client date.

## What Needs to Change

### 1. NewClient Form -- Add "Data Sync Start Date" Picker
**File:** `src/pages/NewClient.tsx`

- Add a date picker (Popover + Calendar) for clients only, labeled "Data Sync Start Date".
- Default to today. Admin picks the date from which historical ad data should be fetched.
- Pass the selected date as `data_fetch_start_date` in the request body to `create-client`.

### 2. create-client Edge Function -- Accept & Save the Date
**File:** `supabase/functions/create-client/index.ts`

- Destructure `data_fetch_start_date` from the request body.
- Include it in the `profileUpdate` object so it gets saved to `profiles.data_fetch_start_date`.

### 3. sync-fast-lane -- Respect Per-Client Start Dates
**File:** `supabase/functions/sync-fast-lane/index.ts`

Currently uses one global `startDateStr` for all accounts. Change to:
- Load `ad_account_clients` junction + client profiles (same pattern as deep-dive).
- For each ad account, determine the earliest linked client's `data_fetch_start_date` (falling back to global setting).
- Use that per-account start date in the API time range.

### 4. sync-deep-dive -- Fix Start Date Logic
**File:** `supabase/functions/sync-deep-dive/index.ts`

Fix the `effectiveStartDate` computation (lines 92-117). Replace with clean logic:
- Collect all linked clients' `data_fetch_start_date` values.
- Pick the **earliest** one that is >= `globalStartDate`.
- If none set, use `globalStartDate`.

### 5. ClientDetail Profile Tab -- Show/Edit the Date
**File:** `src/pages/ClientDetail.tsx`

The Sync Configuration section in the Profile tab likely already shows this field. Verify it's editable and saves correctly. (No change needed if already present.)

---

## Summary

| File | Change |
|------|--------|
| `src/pages/NewClient.tsx` | Add date picker for `data_fetch_start_date` |
| `supabase/functions/create-client/index.ts` | Accept and save `data_fetch_start_date` |
| `supabase/functions/sync-fast-lane/index.ts` | Use per-client start dates instead of global-only |
| `supabase/functions/sync-deep-dive/index.ts` | Fix start date selection logic |

No database changes needed -- `profiles.data_fetch_start_date` column already exists.

