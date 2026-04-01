

## Add Pagination to Cash Flow Recent Activity Tab

### Problem
The Recent Activity tab in Cash Flow currently shows up to 20 items with no pagination, unlike the Transfers and Withdrawals tabs which already have `TablePagination`.

### Changes

**File: `src/pages/CashFlowManagement.tsx`**

1. **Add pagination state** for the activity tab:
   - `actPage` (default 1) and `actPageSize` (default 20)

2. **Increase the data fetch limit** — change `activity.slice(0, 20)` to keep all activity items (e.g., slice 0-100 or remove the slice) so pagination has data to paginate through.

3. **Slice the `recentActivity` array** in the render using `(actPage - 1) * actPageSize` to `actPage * actPageSize`, matching the existing pattern used by transfers and withdrawals.

4. **Add `<TablePagination>`** component below the activity list, wired to `actPage`, `actPageSize`, `recentActivity.length`.

5. **Reset `actPage` to 1** when data reloads.

### Result
The Recent Activity tab gets the same pagination controls as Transfers and Withdrawals tabs, with page size selector and page navigation.

