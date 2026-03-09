

# Plan: Complete Mapping-First Data Display Across All SaaS Pages

## Problem Analysis

After investigating, I found:

1. **Edge functions ARE working correctly** - `sync-fast-lane` logs show data being synced (e.g., "75 rows for act_1304521891359214")
2. **Data EXISTS in database** - `daily_metrics` has 338 records, latest from 2026-03-09 with $12.35 spend
3. **Campaigns ARE properly mapped** - All 48 campaigns have `client_id` set and match `mapping_keyword`

**The Real Issue**: Frontend pages query ALL data from `campaigns` and `daily_metrics` tables directly. While the sync functions now only collect mapped data, the frontend doesn't apply the same filtering logic when displaying data.

---

## Root Cause

The CampaignMapping page fetches:
```typescript
supabase.from("campaigns").select("*")
supabase.from("daily_metrics").select("*")
```

This returns ALL campaigns/metrics without filtering by `ad_account_clients.mapping_keyword`. If there's any legacy unmapped data, it would still appear.

---

## Solution: Apply Mapping Filter in Frontend Queries

### Files to Modify

| Page/Component | Current Query | Change Required |
|----------------|---------------|-----------------|
| `CampaignMapping.tsx` | Fetches all campaigns + metrics | Filter campaigns by `ad_account_clients` with keyword |
| `AdminDashboard.tsx` | Fetches all `daily_metrics` | Filter metrics via campaigns → mapped accounts |
| `ClientDashboard.tsx` | Uses `ad_account_clients` but not keyword filter | Add `mapping_keyword` filter |
| `ClientDetail.tsx` | Fetches via `ad_account_clients` | Ensure keyword filter applied |
| `SpendTrendChart.tsx` | Fetches via `ad_account_clients` | Add keyword filter |
| `ProfitLossWidget.tsx` | Fetches all `daily_metrics` | Filter by mapped campaigns |
| `RevenueVsCostChart.tsx` | Fetches all `daily_ad_spend` | Filter by mapped accounts |

### Implementation Pattern

For all pages that display campaign/spend data, apply this filter logic:

```typescript
// Step 1: Get accounts that have client mappings WITH keywords
const { data: mappedAssignments } = await supabase
  .from("ad_account_clients")
  .select("ad_account_id, client_id, mapping_keyword")
  .neq("mapping_keyword", "");

const mappedAccountIds = [...new Set(mappedAssignments?.map(r => r.ad_account_id) || [])];

// Step 2: Get campaigns ONLY from mapped accounts
const { data: campaigns } = await supabase
  .from("campaigns")
  .select("*")
  .in("ad_account_id", mappedAccountIds);

// Step 3: Get metrics ONLY for those campaigns
const campaignIds = campaigns?.map(c => c.id) || [];
const { data: metrics } = await supabase
  .from("daily_metrics")
  .select("*")
  .in("campaign_id", campaignIds);
```

---

## Changes Summary

1. **CampaignMapping.tsx**: Add `ad_account_clients` filter with `mapping_keyword` check before fetching campaigns/metrics

2. **AdminDashboard.tsx**: Filter `daily_metrics` queries to only include campaigns from mapped accounts

3. **ClientDashboard.tsx**: Already filters by client → ad_account_clients, but ensure `mapping_keyword` is checked

4. **SpendTrendChart.tsx**: Add mapping filter when fetching campaign IDs

5. **ProfitLossWidget.tsx**: Filter metrics through mapped campaigns chain

6. **RevenueVsCostChart.tsx**: Filter `daily_ad_spend` by mapped account IDs

7. **ClientDetail.tsx**: Apply mapping keyword filter to spend data queries

8. **ClientProfitTab.tsx**: Filter campaigns/metrics by mapped accounts

---

## Technical Notes

- The edge functions are correctly syncing only mapped data
- This fix ensures the frontend displays only what's been synced through proper mappings
- Any legacy unmapped data in the database will be hidden from UI
- Realtime subscriptions will continue to work as they listen to table changes

