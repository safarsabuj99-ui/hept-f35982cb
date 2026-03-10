

# Plan: Mobile-Responsive Ad Account Detail + Pull-to-Refresh on Ad Accounts

## Changes

### 1. `src/pages/AdAccountDetail.tsx` — Mobile responsiveness

**Header (lines 355-364)**
- Stack badges below account name on mobile: `flex-col sm:flex-row` for the badges row
- Reduce title to `text-xl sm:text-2xl`

**Tabs (line 367-372)**
- Make TabsList horizontally scrollable on mobile: `overflow-x-auto scrollbar-hide` with `w-auto` grid instead of `grid-cols-4`, use `flex` on mobile
- Hide tab icons on small screens (already done with `hidden sm:inline`)

**Details tab — Save/Sync buttons (lines 462-471)**
- Stack buttons vertically on mobile: `flex-col sm:flex-row w-full sm:w-auto`
- Make buttons full-width on mobile

**Clients tab — Assignments table (lines 487-508)**
- Replace table with card list on mobile (`md:hidden`): each card shows client name, keyword badge, and remove button
- Keep table for `hidden md:block`

**Clients tab — Add Client form (lines 514-561)**
- Stack the client selector, keyword input, and assign button vertically on mobile: `flex-col` with `w-full` inputs

**Billing tab — Outstanding balance (line 581)**
- Reduce text from `text-4xl` to `text-3xl sm:text-4xl`

**Billing tab — Threshold/Date grid (line 598)**
- Already `sm:grid-cols-2` — good. Just ensure inner inline-edit inputs are responsive (`w-full` instead of fixed `w-28`/`w-40`)

**Billing tab — Notifications (lines 736-746)**
- Already card-based — no changes needed

### 2. `src/pages/AdAccounts.tsx` — Pull-to-refresh

- Import `PullToRefresh` component
- Wrap the mobile card view section with `<PullToRefresh onRefresh={loadAccounts}>` (only on mobile, or wrap entire content — the component only activates on touch)
- The existing `loadAccounts` function serves as the refresh handler

### Files Modified
- `src/pages/AdAccountDetail.tsx` — responsive header, tabs, forms, tables
- `src/pages/AdAccounts.tsx` — wrap with PullToRefresh

