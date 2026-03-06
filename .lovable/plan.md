

# Remove "Campaign Deep Dive" Tab and Add Pagination

## Changes

### 1. Remove "Campaign Deep Dive" tab from ClientReports
**`src/pages/ClientReports.tsx`**
- Remove the `<TabsTrigger value="deep-dive">Campaign Deep Dive</TabsTrigger>` tab button
- Remove the entire `<TabsContent value="deep-dive">...</TabsContent>` block
- Keep only "Live Campaigns" and "Overview" tabs

### 2. Add pagination to DeepDiveTable (10 rows per page)
**`src/components/client-analytics/DeepDiveTable.tsx`**
- Add `currentPage` state (default 1), reset to 1 when filters change
- Default page size: 10 rows
- Slice `filteredData` to show only current page rows
- Add pagination controls below the table (Previous / page numbers / Next) using the existing `TablePagination` component
- Totals row should still reflect **all** filtered data (not just current page)

### Files Changed

| File | Change |
|------|--------|
| `src/pages/ClientReports.tsx` | Remove "Campaign Deep Dive" tab |
| `src/components/client-analytics/DeepDiveTable.tsx` | Add pagination with 10 rows per page |

