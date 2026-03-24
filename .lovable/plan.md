

## Bug Analysis: Shared Ad Account Spend Attribution

### Root Cause

When multiple clients share the same ad account, spend is being attributed to ALL clients on that account instead of only the client whose campaigns generated the spend. The `campaigns` table has a `client_id` column that correctly isolates ownership, but **three components ignore it**:

1. **ProfitabilityTable** (Admin Dashboard) — maps campaign spend to clients via `accToClients[ad_account_id]`, giving every client on a shared account the full spend total. This is why OPU and Fahim show identical $10.28.

2. **ClientProfitTab** (Client Detail → Profit tab) — fetches ALL campaigns globally (`supabase.from("campaigns").select(...)` with no `client_id` filter), then filters only by ad account. Shared accounts = duplicated spend.

3. **ClientDashboard** (Client portal) — same pattern: fetches campaigns by `ad_account_id` without filtering by `client_id`.

### Fix (3 files, surgical changes)

**File 1: `src/components/dashboard/ProfitabilityTable.tsx`**
- Change campaign query to also select `client_id`
- Use `campaigns.client_id` to attribute spend directly to the owning client instead of the `accToClients` ad-account-level mapping
- Remove the flawed `accToClients` lookup; replace spend aggregation loop to use `campaignMap[id].client_id`

**File 2: `src/components/ClientProfitTab.tsx`**
- Add `.eq("client_id", clientId)` to the campaigns query (line 63) so only this client's campaigns are fetched
- The downstream `clientAccIds` filter then becomes a safety net, not the primary filter

**File 3: `src/pages/ClientDashboard.tsx`**
- Add `.eq("client_id", effectiveClientId)` to the campaigns query (line 120) so client dashboard only sees its own campaign spend

### Why This is Robust
- `campaigns.client_id` is set at sync time by the ingestion pipeline and is the authoritative source of campaign ownership
- RLS on `campaigns` already enforces `client_id = auth.uid()` for client-role users, so this aligns application queries with the security model
- No schema changes needed — the column already exists and is populated

