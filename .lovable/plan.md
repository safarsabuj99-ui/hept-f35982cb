
# Plan: Complete Mapping-First Filtering for All Data Display

## Problem Identified

1. **AdAccountDetail.tsx (Spend tab)**: Queries `daily_ad_spend` directly by `ad_account_id` **without checking if the campaign matches a mapping keyword**. This shows ALL spend data for the account, including unmapped campaigns.

2. **Legacy data issue**: The database may still contain old records in `daily_ad_spend` from before the mapping-first sync was implemented.

3. **Other pages querying `daily_ad_spend` without full filtering**:
   - `RunwayPrediction.tsx` - fetches recent spend without keyword check
   - `SystemHealthWidget.tsx` - fetches today's spend without keyword check  
   - `UnassignedSpendAlert.tsx` - intentionally shows unmapped data (correct behavior)

## Solution

### 1. AdAccountDetail.tsx - Filter Spend by Mapping Keywords

The Spend tab must only show data for campaigns that match the client's mapping keywords assigned to that account.

**Change `loadSpend()` function**:
```typescript
async function loadSpend(range: ClientDateRange | null) {
  // Step 1: Get mapping keywords for this ad account
  const { data: mappings } = await supabase
    .from("ad_account_clients")
    .select("mapping_keyword")
    .eq("ad_account_id", accountId)
    .neq("mapping_keyword", "");
  
  const keywords = mappings?.map(m => m.mapping_keyword.toLowerCase()) ?? [];
  
  if (keywords.length === 0) {
    setSpendData([]);  // No mappings = no data to show
    return;
  }

  // Step 2: Get all spend, then filter client-side by keyword match
  let query = supabase.from("daily_ad_spend")
    .select("*")
    .eq("ad_account_id", accountId)
    .order("date", { ascending: false })
    .limit(1000);

  if (range) {
    query = query.gte("date", format(range.from, "yyyy-MM-dd"))
                 .lte("date", format(range.to, "yyyy-MM-dd"));
  }

  const { data } = await query;
  
  // Step 3: Client-side filter - only keep rows matching keywords
  const filtered = (data ?? []).filter(row => {
    const nameLower = (row.campaign_name || "").toLowerCase();
    return keywords.some(kw => nameLower.includes(kw));
  });

  setSpendData(filtered);
}
```

### 2. RunwayPrediction.tsx - Filter by Mapped Accounts

Update to only calculate runway from mapped accounts with keywords.

### 3. SystemHealthWidget.tsx - Filter Today's Spend by Mapped Accounts

Update to filter `daily_ad_spend` by mapped account IDs only.

### 4. Optional: Database Cleanup

After frontend is fixed, you may want to clean up legacy unmapped data from `daily_ad_spend` table. This requires a manual database query to delete records that don't match any keyword.

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/AdAccountDetail.tsx` | Filter `loadSpend()` by mapping keywords |
| `src/components/RunwayPrediction.tsx` | Filter spend query by mapped account IDs |
| `src/components/dashboard/SystemHealthWidget.tsx` | Filter today's spend by mapped accounts |

## Result

After implementation:
- **AdAccountDetail Spend tab**: Only shows campaigns matching mapping keywords
- **RunwayPrediction**: Only predicts runway for mapped client accounts
- **SystemHealthWidget**: Only counts mapped spend in daily totals
- **Unmapped/legacy data**: Hidden from all views (not deleted, just filtered out)
