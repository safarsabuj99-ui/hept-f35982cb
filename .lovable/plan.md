

# Plan: API Data Collection Flow + Junction Data Refresh

## Current State Summary

After reviewing the codebase, I found:

1. **Edge Functions (API Collection)** - Already correctly implementing mapping-first logic:
   - `sync-ad-spend`, `sync-fast-lane`, `sync-deep-dive` all query `ad_account_clients` WHERE `mapping_keyword != ''`
   - Campaign-level filtering matches campaign names against keywords before storing
   - Skipped campaigns are counted and logged

2. **Frontend Display Pages** - Most are already filtering correctly:
   - `CampaignMapping.tsx` ✅ - Filters by mapped accounts
   - `AdminDashboard.tsx` ✅ - Filters by mapped accounts  
   - `AdAccountDetail.tsx` ✅ - Filters spend by keywords (recently fixed)
   - `ClientDashboard.tsx` ✅ - Filters by client's assigned accounts

3. **Junction Table Updates** - When `ad_account_clients` is modified (new client assignment or keyword change), there's **no automatic refresh trigger** to:
   - Re-sync data with new keywords
   - Clear/update existing data for changed mappings

---

## Identified Gap: Junction Data Change → Resync

When a user adds/updates a client assignment with a new `mapping_keyword` in `ad_account_clients`:

| Current Behavior | Expected Behavior |
|-----------------|-------------------|
| Junction row saved | Junction row saved |
| No sync triggered | **Trigger sync for affected account(s)** |
| New data not collected until next scheduled sync | New data collected immediately |

---

## Implementation Plan

### 1. Add "Refresh Data" Action After Junction Updates

**Files to Modify:**
- `src/pages/AdAccountDetail.tsx` - Add sync after client assignment save
- `src/pages/ClientDetail.tsx` - Add sync after ad account assignment save

**Logic:**
```typescript
// After successful ad_account_clients insert/update:
await supabase.functions.invoke("sync-fast-lane", {
  body: { client_id: clientId }
});
toast({ title: "Syncing...", description: "Fetching new mapped data" });
```

### 2. Add Global "Resync All Mappings" Button (Optional Enhancement)

In Admin Dashboard or Settings, add a button to force full resync when mappings change.

### 3. Ensure UI Reloads After Sync

After sync completes, call `fetchData()` to refresh displayed data.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/AdAccountDetail.tsx` | Trigger `sync-fast-lane` after adding/updating client assignment |
| `src/pages/ClientDetail.tsx` | Trigger `sync-fast-lane` after assigning ad account to client |

---

## Summary

The edge functions are correctly filtering by mapping keywords. The missing piece is **triggering a resync when junction data changes** so new mappings immediately start collecting data.

