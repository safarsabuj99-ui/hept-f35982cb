
# Full SaaS Audit & Fix Plan

## Issues Found

### Issue 1: Pricing Config Mode Mismatch (Critical Data Bug)
The NewClient page sends `mode: "flat_rate"` but the ClientDetail page expects `mode: "flat"`. This means pricing set during client creation is not recognized when editing later.

- **NewClient.tsx** (line 56): `{ mode: "flat_rate", rates: { meta, tiktok, google } }`
- **ClientDetail.tsx** (line 21-25): expects `mode: "flat"` and `flat_rates: { meta, tiktok, google }`
- **ClientList.tsx** (line 58): checks `config.mode === "flat"` only

**Fix:** Standardize to `mode: "flat"` everywhere. Also standardize the nested key to `flat_rates` (not `rates`). Update NewClient.tsx and create-client edge function to match ClientDetail format.

### Issue 2: Pricing Config Keys Mismatch (Flat Rate Sub-Keys)
NewClient sends `rates: { meta, tiktok, google }` but ClientDetail reads `flat_rates: { meta, tiktok, google }`. Flat rates set during creation are lost when viewing/editing later.

**Fix:** Standardize to `flat_rates` in both NewClient.tsx and the create-client edge function.

### Issue 3: Percentage Key Mismatch
NewClient sends `markup` for percentage mode, but ClientDetail reads `percentage`.

**Fix:** Standardize to `percentage` everywhere.

### Issue 4: Duplicate "Client Assignment" Feature (3 Places)
Manager assignment for a client exists in three separate places:
1. **NewClient.tsx** -- "Assign Manager" dropdown during creation
2. **ClientDetail.tsx** -- "Assigned Manager" dropdown in Profile tab
3. **ClientAssignment.tsx** -- Full dedicated page (`/admin/team` area concept but exists as a standalone page)

The ClientAssignment page is redundant since ClientDetail already has this capability, and the Client List + ClientDetail provides a better workflow.

**Fix:** Remove the standalone ClientAssignment page and route. The feature already works well in ClientDetail.

### Issue 5: Duplicate Dashboard Tabs Show Same Data
AdminDashboard.tsx (lines 264-275): The "Client Data" section has two tabs -- "Client Overview" and "All Clients" -- but both render the exact same `ClientOverviewTable` component with identical data.

**Fix:** Remove the duplicate tab. Keep only one "Client Overview" tab.

### Issue 6: ClientDashboard Uses Legacy `daily_ad_spend` Table
ClientDashboard.tsx (line 160): Still reads from the old `daily_ad_spend` table instead of the new `campaigns` + `daily_metrics` tables. This means client-facing spend data may not match what admins see.

**Fix:** Update ClientDashboard to query `daily_metrics` via `campaigns` joined through `ad_account_clients`, matching the pattern already used in ClientReports.

### Issue 7: AdminDashboard Uses Legacy `daily_ad_spend` Table
AdminDashboard.tsx (lines 72-78): Reads spend from `daily_ad_spend` for KPIs and sparklines instead of the new `daily_metrics` table.

**Fix:** Update AdminDashboard to use `daily_metrics` joined with `campaigns` for spend calculations.

### Issue 8: AdminDashboard Realtime Watches Legacy Table
AdminDashboard.tsx (line 59): Realtime subscription listens to `daily_ad_spend` changes. Should listen to `daily_metrics` instead.

**Fix:** Change realtime channel to watch `daily_metrics`.

### Issue 9: ClientDashboard Realtime Watches Legacy Table
ClientDashboard.tsx (line 177): Same issue -- realtime watches `daily_ad_spend`.

**Fix:** Change to watch `daily_metrics`.

### Issue 10: Custom Exchange Rate Appears in Two Places
In ClientDetail, the "Custom Exchange Rate" field appears in both:
1. Profile tab > "Mapping & Assignment" card (line 440-442)
2. Pricing tab > alongside pricing mode (line 515-522)

Both save the same `custom_exchange_rate` field. This is confusing.

**Fix:** Remove the exchange rate from the Profile tab. Keep it only in the Pricing tab where it logically belongs alongside pricing configuration.

### Issue 11: CampaignMapping Page Uses Legacy `campaign_mappings` Table
CampaignMapping.tsx reads from the old `campaign_mappings` table which is empty and disconnected from the new `campaigns` table. The new engine uses `campaigns` table with ID locking.

**Fix:** Update CampaignMapping page to read from the `campaigns` table instead, showing campaigns with their `client_id` assignment.

### Issue 12: SpendTrendChart Missing Context
The SpendTrendChart component is used in both AdminDashboard and ClientDashboard but may also be reading from legacy tables.

**Fix:** Verify and update SpendTrendChart to use `daily_metrics`.

### Issue 13: ClientDetail Spend Tab Loads by `client_id` on `ad_accounts` (Broken)
ClientDetail.tsx line 81: `supabase.from("ad_accounts").select("id, platform_name").eq("client_id", userId!)` -- But looking at the data, all ad_accounts have `client_id: null`. The real client-to-account mapping is through the `ad_account_clients` junction table.

**Fix:** Use `ad_account_clients` to find the client's ad accounts, matching the pattern in ClientReports.

---

## Implementation Steps

### Step 1: Fix Pricing Config Schema Mismatch
- **NewClient.tsx**: Change `mode: "flat_rate"` to `mode: "flat"`, `rates` to `flat_rates`, `markup` to `percentage`
- **create-client edge function**: Same normalization
- Redeploy edge function

### Step 2: Fix ClientDetail Spend Tab (ad_accounts query)
- Change from querying `ad_accounts` by `client_id` to querying `ad_account_clients` by `client_id`, then getting the ad_account_ids

### Step 3: Remove Duplicate Exchange Rate Field
- Remove "Custom Exchange Rate" from the Profile tab's "Mapping & Assignment" card (keep it in Pricing tab only)

### Step 4: Remove Duplicate Dashboard Tab
- In AdminDashboard, remove the "All Clients" tab that duplicates "Client Overview"

### Step 5: Update ClientDashboard to Use New Tables
- Replace `daily_ad_spend` queries with `daily_metrics` + `campaigns` via `ad_account_clients`
- Update realtime subscription from `daily_ad_spend` to `daily_metrics`

### Step 6: Update AdminDashboard to Use New Tables
- Replace `daily_ad_spend` queries with `daily_metrics` + `campaigns`
- Update realtime subscription

### Step 7: Update CampaignMapping to Use `campaigns` Table
- Read from `campaigns` table instead of `campaign_mappings`
- Allow client assignment on the new table

### Step 8: Update SpendTrendChart
- Verify and update to use `daily_metrics`

### Step 9: Remove ClientAssignment Page
- Remove the redundant standalone page
- Remove route from App.tsx (Note: it doesn't appear in App.tsx routes, but check if it's accessible via navigation -- it's not in AdminLayout nav either, so it may already be orphaned)

---

## Technical Details

### Pricing Config Standardized Schema
```text
Flat Rate:  { mode: "flat", flat_rates: { meta: 145, tiktok: 150, google: 155 } }
Percentage: { mode: "percentage", percentage: 15 }
Default:    { mode: "default" }
```

### Files Modified
| File | Change |
|------|--------|
| src/pages/NewClient.tsx | Fix pricing mode/keys to match standard |
| supabase/functions/create-client/index.ts | Normalize pricing_config keys |
| src/pages/ClientDetail.tsx | Remove duplicate exchange rate, fix ad_accounts query |
| src/pages/AdminDashboard.tsx | Use daily_metrics, remove duplicate tab |
| src/pages/ClientDashboard.tsx | Use daily_metrics via ad_account_clients |
| src/pages/CampaignMapping.tsx | Use campaigns table |
| src/components/SpendTrendChart.tsx | Use daily_metrics |
