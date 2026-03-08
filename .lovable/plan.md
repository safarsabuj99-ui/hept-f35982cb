

# Fix Date Filter Bugs & Add Pagination Across SaaS

## Bugs Found

### Bug 1: AdAccountDetail Spend Tab — Shows all data despite "Today" selected
- `loadAll()` calls `loadSpend(null)` on mount (line 111), passing no date range
- But `spendPreset` defaults to `"today"` (line 65), so UI shows "Today" highlighted
- **Fix**: Change `loadSpend(null)` to `loadSpend({ from: startOfDay(new Date()), to: endOfDay(new Date()) })`

### Bug 2: ClientDetail Spend Tab — Same issue
- `loadSpendData(accountIds, null)` on mount (line 149) passes no filter
- But `spendDatePreset` defaults to `"today"` (line 84)
- **Fix**: Pass today's range instead of `null`

### Bug 3: CampaignMapping — Fetches all metrics then filters client-side
- `fetchData()` loads ALL `daily_metrics` from DB (line 38) with no date filter, risks hitting 1000-row limit
- Client-side filtering works but data may be incomplete
- **Fix**: This is less critical since the date state is initialized correctly and client-side filter works. But note the 1000-row risk.

### Bug 4: Missing Pagination on Spend Tables
- **AdAccountDetail** spend tab: No pagination, just `limit(500)` on query
- **ClientDetail** spend tab: Hardcoded `slice(0, 50)` with no pagination controls

## Changes

### 1. `src/pages/AdAccountDetail.tsx`
- Change `loadSpend(null)` in `loadAll()` to `loadSpend(getPresetRange("today"))` using today's date range
- Import `startOfDay`/`endOfDay` (already imported via `format`)
- Add `spendPage`/`spendSize` state
- Add `TablePagination` component to spend table
- Paginate `spendData` with `.slice((spendPage-1)*spendSize, spendPage*spendSize)`

### 2. `src/pages/ClientDetail.tsx`
- Change `loadSpendData(accountIds, null)` to `loadSpendData(accountIds, { from: startOfDay(new Date()), to: endOfDay(new Date()) })`
- Replace hardcoded `slice(0, 50)` with pagination state + `TablePagination` component
- Add `spendPage`/`spendSize` state, reset page on date change

### Files Modified
| File | Changes |
|------|---------|
| `src/pages/AdAccountDetail.tsx` | Fix initial load date filter + add spend pagination |
| `src/pages/ClientDetail.tsx` | Fix initial load date filter + add spend pagination |

