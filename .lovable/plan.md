

## Plan: Hide Non-Active Campaigns With No Data

**Problem:** The campaign analytics panel shows some non-active campaigns that have zero metrics data. Only active campaigns should be visible when they have no data; all other campaigns should only appear if they have actual metrics.

**Current behavior (line 159-161 in ClientReports.tsx):** The filter uses `r.status === 'active'` which is an exact string match. However, campaigns can have statuses like `"active - ad groups paused"`, `"enable"`, or other TikTok-mapped statuses that should also count as active but are currently treated as non-active — meaning they show up only if they have data.

**Solution:** Replace the simple `r.status === 'active'` check with a proper `isActiveStatus()` helper (same logic as in `DeepDiveTable.tsx`) across all three files that have this filter pattern.

### Files to change

**1. `src/pages/ClientReports.tsx` (line 159-161)**
- Extract or import an `isActiveStatus` helper
- Change filter from `r.status === 'active'` to `isActiveStatus(r.status)`
- Also update the active campaign injection loop (line 144) to use `isActiveStatus(c.status)` instead of `c.status === 'active'`

**2. `src/pages/ClientDetail.tsx` (line 390-392)**
- Same change: use `isActiveStatus(r.status)` in the filter

**3. `src/pages/AdAccountDetail.tsx` (line 347-349)**
- Same change: use `isActiveStatus(r.status)` in the filter

**Helper function** (shared utility or inlined):
```typescript
const isActiveStatus = (status: string) => {
  const s = status.toLowerCase();
  return s === "active" || s.startsWith("active -") || s === "enable";
};
```

This ensures only truly inactive/paused campaigns with zero data are hidden, while all active campaigns (including TikTok variants) remain visible.

