## Goal

Make every mapping keyword **globally unique within an agency** (case-insensitive). If "Musa" is taken by Client A, no other client — and no other ad-account assignment — can ever use "Musa", "musa", or "MUSA" again in that org.

---

## Why this matters

Right now two clients can accidentally share the same keyword (e.g. "Musa"), which causes the sync engine to attribute the same campaigns to multiple clients — corrupting spend numbers, profit reports, and Ad Guard pause behavior.

---

## What gets enforced

The check covers **both** places a keyword can be stored:

1. `profiles.mapping_keyword` — the legacy default keyword set on a client profile
2. `ad_account_clients.mapping_keyword` — the per-ad-account keyword used by sync

A keyword is considered "in use" if it appears in either table for the same `org_id`. Empty keywords are always allowed (no clash).

---

## Steps

### 1. Database — uniqueness guarantee (migration)

Add a Postgres trigger function `check_mapping_keyword_unique()` that runs on INSERT/UPDATE on both tables:

- Skips rows where keyword is NULL or empty
- Compares using `LOWER(TRIM(keyword))` scoped to `org_id`
- Skips rows belonging to the same client (so a client can keep the same keyword across its own ad accounts)
- Raises a clean error like: `Keyword "Musa" is already used by client "Rahim Trading". Please choose a different keyword.`

Two triggers:
- `BEFORE INSERT OR UPDATE OF mapping_keyword ON profiles`
- `BEFORE INSERT OR UPDATE OF mapping_keyword ON ad_account_clients`

Plus a helpful partial unique index for fast lookups:
```text
CREATE UNIQUE INDEX uniq_mapping_keyword_per_org
  ON ad_account_clients (org_id, LOWER(TRIM(mapping_keyword)))
  WHERE mapping_keyword IS NOT NULL AND mapping_keyword <> '';
```
(The trigger handles the cross-table + same-client-allowed cases the index can't.)

### 2. Pre-flight cleanup

Before the constraint can apply, run a one-time SELECT report (shown to you first) listing any **existing duplicates**. The migration will:
- Print duplicates found (no auto-merge — you decide)
- Only then activate the trigger

If duplicates exist, you'll get a list and we resolve them manually before locking the rule in.

### 3. UI — friendly errors + live availability check

Update three keyword input points to surface the error gracefully (toast: "Keyword already used by [Client Name]") and add a small **inline availability indicator** as the admin types:

- **`src/pages/NewClient.tsx`** — Mapping Keyword field (new client form)
- **`src/pages/ClientDetail.tsx`** — Profile mapping keyword + ad-account assignment keyword
- **`src/pages/AdAccountDetail.tsx`** — "Assign clients" keyword field

Inline check: debounced query against both tables filtered by `org_id` + `LOWER(TRIM(keyword))`. Shows:
- ✅ green "Available"
- ❌ red "Already used by [Client Name]"

Submit buttons stay enabled (server is the source of truth), but if the user clicks while red, the toast explains it clearly.

### 4. Verification

- Try creating two clients with keyword "Musa" → second one blocked
- Try assigning the same keyword to an ad account under a different client → blocked
- Try assigning "musa" (lowercase) when "Musa" exists → blocked
- Same client reusing their own keyword across multiple of their own ad accounts → allowed
- Empty keyword on multiple clients → allowed

---

## Technical details

- Trigger uses `SECURITY DEFINER` + `SET search_path = public` (matches all other triggers in the project)
- Cross-table check inside the trigger: queries the *other* table for any conflicting `(org_id, LOWER(TRIM(keyword)))` pair where `client_id` differs from the row being written
- Error raised with `RAISE EXCEPTION` carrying the client's `full_name` so the UI toast is informative without an extra round-trip
- The availability check is a lightweight `SELECT client_id, full_name FROM ...` joined on profiles; debounced 400 ms on input
- Sync functions (`sync-fast-lane`, `sync-deep-dive`, `sync-orchestrator`) need no changes — they already lowercase keywords on read

## Files touched

- New migration: `add_unique_mapping_keyword_constraint.sql` (function + 2 triggers + 1 index)
- `src/pages/NewClient.tsx` — inline availability check + better error toast
- `src/pages/ClientDetail.tsx` — inline availability for profile keyword & ad-account assign keyword
- `src/pages/AdAccountDetail.tsx` — inline availability for "Assign clients" keyword
- (Optional) Small shared hook `src/hooks/useKeywordAvailability.ts` to avoid repeating the debounced-check logic in three places
