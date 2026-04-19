

## Auto-Import Bug — Wrong org_id Assignment

### Root Cause (Confirmed via DB)

When the auto-import edge function inserts new ad_accounts:
1. It uses the **service role client** → `auth.uid()` is NULL inside the BEFORE INSERT trigger
2. Trigger `set_org_id_for_ad_accounts` calls `get_user_org_id(auth.uid())` → returns NULL
3. Trigger falls through to the last-resort fallback: `SELECT id FROM organizations LIMIT 1` → returns the **wrong org** (currently "Test1", `f0544331...`)
4. Account is inserted with the wrong `org_id` → **invisible to the actual importer's RLS scope**

Verified: The "EMON (HEPT)" account just imported by SABUJ admin (org `a1b2c3d4...`) was actually written to org `f0544331...` (Test1). That's why:
- Dialog shows "Already imported" (the dialog's existing-set query has no org filter — checks all rows globally)
- Page list & search don't show it (RLS filters by org_id)

### The Fix (Two Layers — Defense in Depth)

**Layer 1 — Edge function: explicitly set `org_id` on insert (PRIMARY FIX)**

In `supabase/functions/auto-import-accounts/index.ts`, the function already fetches `orgId` near line 335 from the calling user's profile. Pass it through to every insert payload:

```ts
newAccounts.push({
  // ...existing fields,
  org_id: orgId,  // ← add this in BOTH insert blocks (selected_accounts mode + legacy mode)
});
```

This is the authoritative source — the importer's own org. Bypasses the broken trigger fallback entirely.

**Layer 2 — Existing-set check should be org-scoped**

Currently the "already imported" check queries ALL ad_accounts across all orgs, leading to false positives across tenants. Scope it to the importer's org:

```ts
const { data: existingAccounts } = await adminClient
  .from("ad_accounts")
  .select("ad_account_id, platform_name")
  .eq("org_id", orgId);  // ← add org filter
```

This makes the "Already imported" badge match what the user can actually see, and prevents cross-tenant skip-as-duplicate bugs.

**Layer 3 — Harden the trigger (safety net)**

Update `set_org_id_for_ad_accounts` to use the row's `api_integration_id` to derive `org_id` when `auth.uid()` is NULL (service-role contexts), instead of falling back to `organizations LIMIT 1`:

```sql
-- New fallback chain:
-- 1. NEW.org_id (if explicitly provided)  ← what we now do in edge fn
-- 2. get_user_org_id(auth.uid())
-- 3. Look up via NEW.api_integration_id → api_integrations.org_id
-- 4. RAISE EXCEPTION (no more silent wrong assignment)
```

Eliminates the silent-corruption mode for any future service-role inserter.

**Layer 4 — One-shot data correction**

Fix the EMON account already in the wrong org:
```sql
UPDATE ad_accounts a
SET org_id = i.org_id
FROM api_integrations i
WHERE a.api_integration_id = i.id
  AND a.org_id <> i.org_id;
```
Reassigns any mis-orged ad_account back to the org of its source integration.

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/auto-import-accounts/index.ts` | Add `org_id: orgId` to both insert payloads; add `.eq("org_id", orgId)` to existing-set query |
| Migration | Harden `set_org_id_for_ad_accounts` (use api_integration_id fallback, drop org-LIMIT-1); one-shot UPDATE to repair mis-orged accounts |

### Why This Is Bulletproof
- **Primary fix** writes the correct org_id explicitly — no reliance on triggers.
- **Defense in depth**: hardened trigger ensures future service-role inserters can't silently corrupt either.
- **Self-healing**: the data-repair UPDATE immediately surfaces lost accounts (EMON + any others) to their rightful owners.
- **Cross-tenant correctness**: the existing-set scope-fix prevents one org's accounts from blocking another's import.

### Build Time
~5 minutes. 1 edge function patch + 1 migration. Zero breaking changes.

