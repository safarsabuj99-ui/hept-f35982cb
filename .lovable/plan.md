

## Plan: Sort Active Campaigns First

**Problem:** Campaigns are not sorted by status — active campaigns should appear before paused/inactive ones.

**Solution:** Add a default sort in the `filteredData` memo inside `DeepDiveTable.tsx` that places active campaigns first, while preserving the existing filter and search logic.

### Changes

**File: `src/components/client-analytics/DeepDiveTable.tsx`**

In the `filteredData` useMemo (around line 163-178), after filtering by status and search query, sort the results so active campaigns (`ACTIVE`, `ENABLED`, or similar active statuses via the existing `isActiveStatus` helper) appear first, followed by all others. Within each group, maintain the original order.

```typescript
// At the end of filteredData memo, before return:
filtered.sort((a, b) => {
  const aActive = isActiveStatus(a.status) ? 0 : 1;
  const bActive = isActiveStatus(b.status) ? 0 : 1;
  return aActive - bActive;
});
```

This is a single-line addition that leverages the existing `isActiveStatus` helper already used in the component.

