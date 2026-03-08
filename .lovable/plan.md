

# Add Ad Account Assignment Tab to Client Detail Page

## What Changes
Add an "Ad Accounts" tab to the Client Detail page (`src/pages/ClientDetail.tsx`) that mirrors the client assignment UI on the Ad Account Detail page — but in reverse direction. From here, admins can see which ad accounts are assigned to this client, assign new ones (with mapping keyword), and remove assignments.

## Technical Plan

### `src/pages/ClientDetail.tsx`

1. **Load ad accounts data** in `loadAll()`:
   - Already fetching `ad_account_clients` for this client (line 85). Extend to also fetch `ad_accounts` list for the assignment dropdown and join assignment data with account details.
   - Add state: `adAccounts` (all available), `adAccountAssignments` (current assignments with account info), `newAdAccount`, `newAdKeyword`, `assigningSaving`.

2. **Add new tab trigger** in the TabsList (line 339):
   - Change grid from `grid-cols-7` to `grid-cols-8`
   - Add `<TabsTrigger value="adaccounts">Ad Accounts</TabsTrigger>`

3. **Add TabsContent for "adaccounts"**:
   - Table showing current assignments: Account Name, Platform, Ad Account ID, Mapping Keyword, Remove button
   - Assignment form: Select dropdown of unassigned ad accounts + keyword input + Assign button
   - Each row links to the Ad Account Detail page via Eye icon
   - Uses the same `ad_account_clients` table — identical insert/delete logic as `AdAccountDetail.tsx` lines 181-206, just with `client_id` fixed and `ad_account_id` selected from dropdown

### No database or migration changes needed — uses existing `ad_account_clients` junction table.

