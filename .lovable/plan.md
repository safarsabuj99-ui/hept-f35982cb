

## Remove Delete + Make KPIs Clickable Filters

### Changes (agency Expense Manager — `/admin/finance?tab=expenses`)

**1. Permanent history (no deletion)**
- Remove the `Trash2` delete button from both mobile card and desktop table rows.
- Remove the `handleDelete` function.
- Drop the empty trailing `<TableHead></TableHead>` and matching `<TableCell>`.
- Add a DB-level safeguard migration: RLS policy that explicitly denies `DELETE` on `agency_expenses` for all roles (defense-in-depth so even a direct API call can't delete).

**2. KPI-driven category filter**
- Add `categoryFilter` state: `"all" | "opex" | "owner_draw"`.
- Make the 3 KPI cards clickable (cursor-pointer + active ring) — clicking toggles the filter:
  - **Total Expenses** → `all` (shows everything, default)
  - **OpEx** → `opex` (shows everything except `Owner_Draw`)
  - **Owner's Draw** → `owner_draw` (shows only `Owner_Draw`)
- Filter the rendered expense rows + pie chart through this filter (totals stay computed from full set so KPIs don't change when filtering).
- Active KPI gets visual highlight (ring-2 ring-primary).
- Update history card title dynamically: "Expenses (Today) — Owner's Draw" when filtered.
- Click active KPI again → resets to `all`.

### Files Changed

| File | Change |
|---|---|
| `src/pages/ExpenseManager.tsx` | Remove delete UI + handler; add `categoryFilter` state + clickable KPIs + filtered list/pie |
| New migration | RLS deny-delete policy on `agency_expenses` |

### Build Time
~5 min. Pure UI + 1 RLS policy. No data loss, no breaking changes.

