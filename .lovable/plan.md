

## Grouped Task Management for Multi-Ad Campaign Requests

### Problem
Currently, the admin Campaign Requests page (`OrderManagement.tsx`) displays requests as flat rows. To see or manage individual tasks within a multi-ad request, the admin must open a detail modal. This adds friction when processing high-volume multi-task requests.

### Solution
Replace the flat table/card layout with an **expandable grouped view** — each request row expands inline to reveal its child tasks with per-task action controls, progress tracking, and a visual completion indicator. This eliminates the need to open a modal for routine task management.

### Changes — `src/pages/OrderManagement.tsx`

**1. Inline expandable rows (desktop table)**
- Replace static `TableRow` with an expandable row pattern: clicking the row toggles a collapsible sub-row beneath it showing all child tasks.
- Each child task row displays: platform badge, objective, creative link, budget, quantity, individual status badge, and per-task action buttons (Start / Complete / Reject).
- Multi-task requests show a **progress bar** in the main row (e.g., "3/5 done") instead of just a count badge.

**2. Inline expandable cards (mobile)**
- Convert mobile cards to use `Collapsible` (already used in `MyCampaignRequests.tsx`) so tasks expand inline.
- Each task within the expanded section gets its own action buttons.

**3. Visual progress indicator**
- For requests with 2+ tasks, show a mini progress bar or fraction (e.g., `2/4 completed`) in the main row/card.
- Color-code: all-pending = yellow, mixed = blue, all-done = green.

**4. Per-task reject with reason**
- Add a small reject dialog for individual tasks (currently only bulk reject has a reason field). Reuse the existing reject modal pattern but scope it to a single task.

**5. Keep detail modal as secondary view**
- The "Eye" detail modal stays available for full context view, but routine task management happens inline without opening it.

### Files Modified
- `src/pages/OrderManagement.tsx` — All changes in this single file. Add `Collapsible` import, refactor desktop rows to expandable pattern, refactor mobile cards, add task progress helper, add per-task reject dialog state.

### No database changes required.

