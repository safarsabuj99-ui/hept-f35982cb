

## Add Ad Account Filter to Campaigns Page

**What changes:** Add a searchable ad account dropdown filter next to the existing client filter. When a client is selected, the ad account dropdown narrows to only show ad accounts assigned to that client. When an ad account is selected, campaigns are filtered to only that account.

### File: `src/pages/CampaignMapping.tsx`

1. **New state**: `adAccountFilter` (default `"all"`) and `adAccountPopoverOpen`

2. **Derived ad account list**: Compute a filtered list of ad accounts based on the selected client. Uses `ad_account_clients` mapping data (already fetched as `mappedAssignments`) to filter accounts when a client is selected.

3. **New UI control**: Add a searchable Popover/Command dropdown (same pattern as the client filter) labeled "Ad Account" between the client filter and date range filter. Shows account name + platform badge.

4. **Cascading behavior**:
   - Client = "All" → Ad Account dropdown shows all mapped ad accounts
   - Client = specific → Ad Account dropdown shows only that client's ad accounts
   - Changing client resets ad account filter to "All"

5. **Filter logic**: Update `filteredRows` memo to also filter by `ad_account_id` when an ad account is selected (matching via campaign's `ad_account_id`).

6. **Store `mappedAssignments` in state** so it's available for the cascading filter logic (currently it's only a local variable inside `fetchData`).

### No database or backend changes needed — purely client-side filtering of already-fetched data.

