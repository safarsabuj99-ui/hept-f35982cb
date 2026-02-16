
# Add Pagination to All List Views

## Overview
Add a reusable pagination system with a "rows per page" selector (10, 20, 30, 50) to every table/list view in the app. This will improve load times and keep the UI responsive as data grows.

## Approach
Create one reusable `TablePagination` component, then integrate it into each page. Most pages will use **client-side pagination** (fetch data, paginate in memory) since the datasets are moderate. For pages with potentially large datasets (Audit Logs, Spend Report), we'll use **server-side pagination** with Supabase `.range()` for true performance gains.

## New Component

### `src/components/TablePagination.tsx`
A self-contained pagination bar with:
- **Rows per page selector**: Dropdown with options 10, 20, 30, 50
- **Page info**: "Showing 1-20 of 156 results"
- **Navigation**: Previous / Next buttons with page numbers
- Uses the existing `src/components/ui/pagination.tsx` primitives under the hood

Props:
```text
totalItems: number
pageSize: number
currentPage: number
onPageChange: (page: number) => void
onPageSizeChange: (size: number) => void
```

## Pages to Update

### Client-Side Pagination (slice displayed data)
These pages fetch manageable datasets; we paginate the filtered array in memory:

| Page | Current Behavior | Change |
|------|-----------------|--------|
| **ClientList** | Fetches all clients, no limit | Add pagination below table |
| **PaymentRequests** | Fetches all, no limit | Add pagination below table |
| **OrderManagement** | Fetches all, filters by tab | Add pagination per tab |
| **TeamManagement** | Fetches all managers | Add pagination below table |
| **WalletInventory** | Fetches all USD purchases | Add pagination below purchase table |
| **ExpenseManager** | Fetches all expenses | Add pagination below expense table |
| **CashFlowManagement** | Fetches all transfers | Add pagination to transfers/activity lists |

For each page:
1. Add `pageSize` and `currentPage` state (default: page 1, size 20)
2. Replace rendering of `filtered.map(...)` with `filtered.slice(start, end).map(...)`
3. Add `<TablePagination>` below the table
4. Reset `currentPage` to 1 when filters/search change

### Server-Side Pagination (fetch only what's needed)
These pages can have thousands of rows; we'll use Supabase `.range(from, to)` to fetch only the current page:

| Page | Current Behavior | Change |
|------|-----------------|--------|
| **AuditLogs** | `.limit(200)` | Use `.range()` with count query |
| **SpendReport** | Fetches all, `.slice(0, 100)` | Use `.range()` with count query |

For each page:
1. Add a count query: `.select('*', { count: 'exact', head: true })` to get total rows
2. Fetch only the current page: `.range(start, end)`
3. Re-fetch when page or pageSize changes
4. Add `<TablePagination>` below the table

## Technical Details

### Default Page Size
- Default: **20 rows** for all views
- Stored in component state (not persisted across sessions to keep it simple)

### Page Reset Logic
- When a search/filter input changes, `currentPage` resets to 1
- When `pageSize` changes, `currentPage` resets to 1

### Server-Side Count Query Pattern
For AuditLogs and SpendReport:
```text
// First: get total count
const { count } = await supabase
  .from("audit_logs")
  .select("*", { count: "exact", head: true });

// Then: fetch current page
const { data } = await supabase
  .from("audit_logs")
  .select("*")
  .order("created_at", { ascending: false })
  .range(from, to);
```

### File Changes Summary
- **New**: `src/components/TablePagination.tsx`
- **Modified** (9 files): `ClientList.tsx`, `PaymentRequests.tsx`, `OrderManagement.tsx`, `TeamManagement.tsx`, `WalletInventory.tsx`, `ExpenseManager.tsx`, `CashFlowManagement.tsx`, `AuditLogs.tsx`, `SpendReport.tsx`
