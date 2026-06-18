## Goal

Make the **Spend** tab on the Client Detail page (`/admin/clients/:id` → Spend) look and behave exactly like the admin **Campaigns** page (`/admin/campaigns`), and add a **Deep Dive Sync** button that backfills data for **only this client's** ad accounts.

## Why

The current Spend tab uses a custom layout (4 KPI cards + Live/Overview sub-tabs + per-platform sub-tabs around a bare `DeepDiveTable`). The admin Campaigns page uses the much richer `CampaignAnalyticsPanel`, which already includes: search, status filter, platform tabs, bulk pause/resume, sorting, column customization, refresh state, and proper KPI summary — everything the user wants here, in one component.

A per-client deep-dive button is also needed so admins can force-refresh one client's data without re-syncing the entire org.

## Changes

### 1. `src/pages/ClientDetail.tsx` — rebuild the Spend tab

Replace the entire `<TabsContent value="spend">` block (the KPI grid, the nested Live/Overview tabs, the per-platform tabs, and the four `<DeepDiveTable>` instances) with the same structure used by `CampaignMapping.tsx`:

- Header row: `ClientDateFilter` + small **Deep Dive Sync** button + refreshing spinner.
- Single `<CampaignAnalyticsPanel campaignRows={spendCampaignRows} onRefresh={reloadSpendData} isAdmin={true} />`.
- Remove `SalesFunnel` / `PlatformComparison` from this tab (the analytics panel already gives that). Their imports stay only if used elsewhere.
- Keep all existing state (`spendData`, `spendCampaigns`, `spendAdAccountMap`, `spendDateRange`, etc.) and `loadSpendData` exactly as-is — only the JSX changes. The existing `spendCampaignRows` memo already produces `CampaignRow[]`, so it plugs straight into the panel.

Add the **Deep Dive Sync** button (lucide `Zap` or `RefreshCw` icon):
- Disabled while a request is in flight.
- On click: gather this client's ad account IDs (already loaded into `adAccounts` / via `ad_account_clients` for `client.user_id`) and POST to `sync-orchestrator` with `{ function: "sync-deep-dive", ad_account_ids: [...] }`.
- Toast on success ("Deep dive sync queued for N accounts") / error.
- After ~2s call `reloadSpendData()` so realtime + manual refresh both show the incoming rows.

### 2. `supabase/functions/sync-orchestrator/index.ts` — accept a client/account scope

Currently the orchestrator loads **all** mapped ad accounts. Add an optional filter:

- Read `ad_account_ids?: string[]` (and optionally `client_id?: string`) from the request body.
- If `client_id` is provided, resolve it to ad account IDs via `ad_account_clients` (still respecting `mapping_keyword != ''`).
- If `ad_account_ids` is provided, intersect it with the mapped-accounts list so we never sync unmapped accounts.
- Everything downstream (chunk building, `sync_jobs` inserts, fan-out to `sync-deep-dive` / `sync-fast-lane`) is unchanged — it just operates on the filtered subset.
- Logging line updated to include the scope (`scope=client:<id>` or `scope=accounts:N`) so we can confirm in logs that the per-client trigger really only touched that client.

No DB migration needed — this is purely a request-shape change on the orchestrator. Existing callers (cron, global Sync Now button) continue to work because both new fields are optional.

### 3. Out of scope (not changed)

- `sync-deep-dive` itself — already operates per-account based on the job row.
- `daily_metrics` schema, RLS, `CampaignAnalyticsPanel`, `DeepDiveTable`.
- Other tabs on Client Detail (Profile, Pricing, Ad Guard, Accounts, Profit, Payments, Transactions).

## Verification

1. Open a client → Spend tab → confirm the layout now matches `/admin/campaigns` (search bar, status dropdown, platform tabs with counts, bulk action toolbar, sortable headers, column customization).
2. Date presets (Today / Yesterday / This Week / …) still filter the rows.
3. Click **Deep Dive Sync** → toast appears, `sync_jobs` table gets new rows only for this client's ad account IDs (verify with `supabase--read_query`), edge function logs show the new scope line, and within ~30s realtime updates land in the table.
4. Trigger a global sync from elsewhere → confirm it still enqueues all mapped accounts (no regression).
