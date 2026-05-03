## Goal
Transform `/admin/finance?tab=expenses` from a basic 3-KPI + pie page into an information-dense, premium glassmorphic command center for cash outflows — with trends, comparisons, breakdowns, top categories, and inline row actions.

## What's wrong today
- Only 3 KPIs (Total / OpEx / Owner's Draw), all in BDT — no context, no deltas, no avg/largest.
- Single pie chart, no trend over time, no comparison vs previous period.
- Table only shows Date / Category / Amount — no description, no source account, no actions (edit/delete).
- No category-level summary bars or month-over-month context.
- Empty states are flat ("No data yet") with no CTA.
- Visually flat — cards lack the premium glassmorphism / glow used elsewhere.

## New layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Header: "Expenses" + period chip      [Export CSV] [+ Add]   │
├──────────────────────────────────────────────────────────────┤
│ DateRangeFilter (existing)                                   │
├──────────────────────────────────────────────────────────────┤
│  KPI ROW — 4 cards (glass + glow, click to filter)           │
│  ┌──────────┬──────────┬──────────┬──────────────────────┐  │
│  │ Total    │ OpEx     │ Owner's  │ Avg / Day            │  │
│  │ ৳X       │ ৳X       │ Draw ৳X  │ ৳X  (largest: ৳Y)    │  │
│  │ ▲12% vs  │ ▲5% vs   │ ▼3% vs   │ N expenses logged    │  │
│  │ prev     │ prev     │ prev     │                      │  │
│  └──────────┴──────────┴──────────┴──────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  TREND (col-span-2)              │  CATEGORY BREAKDOWN      │
│  Daily area chart                │  Horizontal bars per cat │
│  (BDT spent per day)             │  with % of total + ৳     │
├──────────────────────────────────────────────────────────────┤
│  EXPENSES TABLE (full width)                                 │
│  Date │ Category │ Description │ Paid From │ Amount │ ⋯     │
│  - Search box + category multi-filter pills                  │
│  - Row hover reveals Edit / Delete                           │
│  - Premium empty state with "Add your first expense" CTA     │
└──────────────────────────────────────────────────────────────┘
```

## Features added

1. **4th KPI: Avg/Day + largest single expense + count** — gives operators a sense of velocity, not just totals.
2. **Period-over-period deltas** — query the previous equal-length window and show ▲/▼ % vs prev on each KPI card.
3. **Daily spend trend** — Recharts area chart bucketed by day across selected range, BDT axis. Replaces the half-empty distribution column with something actionable.
4. **Category breakdown bars** — keep distribution insight but in a more readable horizontal bar list (category, ৳ amount, % of total, colored bar) instead of a pie that becomes useless past 3 segments.
5. **Richer table**:
   - Add Description column (truncated w/ tooltip).
   - Add "Paid From" column (joins `agency_accounts.name` via `paid_from_account_id`).
   - Inline search input (matches description / category).
   - Row actions menu: **Edit** (opens existing dialog prefilled) and **Delete** (with confirm + atomic balance refund via existing `adjustAccountBalance` if originally paid from an account).
6. **Export CSV** button — exports current filtered view (date, category, amount, description, paid_from).
7. **Premium empty states** — illustration + CTA button instead of plain text.
8. **Visual polish**:
   - All cards use `glass-card glow-border` with subtle gradient accents per KPI (primary / chart-meta / warning / success).
   - Animated number counters on KPI mount.
   - Smooth `animate-slide-up-fade` staggers (already in codebase).
   - Mobile: KPIs become 2x2 grid; trend + breakdown stack; table → premium card list with description preview.

## Technical notes

- All new data derived client-side from a single fetch — extend `fetchExpenses` to also fetch a previous-period query in parallel for deltas (use `Promise.all`).
- Join `paid_from_account_id` → `agency_accounts.name` via a second lightweight fetch keyed by id (already loading `agencyAccounts`, just look up by id).
- Daily trend: bucket `expenses` by `date` across the selected range, fill missing days with 0 so the chart spans the full window.
- Edit/Delete: new `updateExpense` / `deleteExpense` handlers calling `supabase.from('agency_expenses')`. Delete must refund the source `agency_accounts.current_balance_bdt` if `paid_from_account_id` is set (use `adjustAccountBalance` helper for atomic +amount). Wrap in toast feedback.
- CSV export: build string client-side, trigger `Blob` download — no new deps.
- Honor existing currency policy: BDT (৳) everywhere on this page (memory: `currency-display-policy`).
- Honor existing date standards (UTC+6, lexicographic compare) — reuse `DateRangeFilter` helpers already imported.
- Honor mobile responsiveness standard: stack on `<sm`, 2x2 KPIs on `sm`, 4-up on `lg`.

## Files to edit

- `src/pages/ExpenseManager.tsx` — full redesign per layout above (single file, ~contained).

No DB migrations needed. No new dependencies.
