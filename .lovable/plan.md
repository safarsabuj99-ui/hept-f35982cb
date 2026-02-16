

# Add Pagination to Remaining List Views

## Overview
Six pages/components with table views are missing the pagination system. Adding the `TablePagination` component to each one for consistency and performance.

## Pages to Update

| Page | Description |
|------|-------------|
| **PendingApprovals.tsx** | Pending transaction approvals table |
| **MyCampaignRequests.tsx** | Client's campaign request list |
| **AdAccounts.tsx** | Ad accounts management table |
| **CampaignMapping.tsx** | Campaign-to-client mapping table |
| **ClientAssignment.tsx** | Client-to-manager assignment table |
| **ClientOverviewTable.tsx** | Dashboard client overview table |

## Changes per File (same pattern for all)

For each file:
1. Import `TablePagination` from `@/components/TablePagination`
2. Add `pageSize` (default 20) and `currentPage` (default 1) state variables
3. Slice the displayed array: `items.slice((currentPage - 1) * pageSize, currentPage * pageSize)`
4. Add `<TablePagination>` component below the table
5. Reset `currentPage` to 1 when filters/search change (where applicable)

## Technical Details

- All six use client-side pagination (datasets are moderate)
- The `ClientOverviewTable` component receives data via props, so pagination is applied to the `sorted` array internally
- For `MyCampaignRequests`, which uses collapsible rows, pagination applies to the top-level request list
- No database or backend changes needed

## File Summary
- **Modified** (6 files): `PendingApprovals.tsx`, `MyCampaignRequests.tsx`, `AdAccounts.tsx`, `CampaignMapping.tsx`, `ClientAssignment.tsx`, `ClientOverviewTable.tsx`

