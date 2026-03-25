

## Plan: Full Admin Mobile Optimization

### Current State
Some pages already have mobile card views (PaymentRequests deposits tab, AdAccounts). However, many critical admin pages still render desktop-only tables that overflow or become unusable on mobile.

### Pages Requiring Mobile Optimization

**Priority 1 — High-use action pages (need mobile card views replacing tables)**

| Page | Issue |
|------|-------|
| **ClientList** | Desktop table only, no mobile card view. Columns overflow on small screens. |
| **TeamManagement** | Desktop table only. Search bar fixed at `w-64` (breaks on mobile). No card alternative. |
| **OrderManagement** | Desktop table only for campaign requests. No mobile card view. |
| **AuditLogs** | Desktop table only. Description column hidden but still cramped. |
| **ClientOverviewTable** (Dashboard widget) | Desktop table only. Action buttons use hover-opacity pattern. |

**Priority 2 — Layout & header fixes**

| Component | Issue |
|-----------|-------|
| **AdminLayout header** | Mobile header is minimal but functional. Add page title display on mobile. |
| **AdminDashboard** | KPI grid and section labels are decent but Quick Actions strip could use better mobile spacing. |
| **Dashboard headers** (various pages) | `flex items-center justify-between` patterns break when title + button don't fit in one row. |

### Implementation Plan

**Step 1: ClientList mobile card view**
- Add `md:hidden` card list showing: name, business, pricing badge, balance, and action buttons (Add Funds + View)
- Hide desktop table on mobile with `hidden md:block`
- Make search input full-width on mobile

**Step 2: TeamManagement mobile card view**
- Add mobile cards with: name, email, role preset badge, client count, active/inactive toggle, permissions button
- Fix search bar: change `w-64` to `w-full sm:w-64`
- Stack header title + "New Manager" button vertically on mobile

**Step 3: OrderManagement mobile card view**
- Add `md:hidden` card list for campaign requests showing: client name, platform badge, budget, status badge, and action buttons
- Keep existing tab counts grid (already `grid-cols-2`)

**Step 4: AuditLogs mobile card view**
- Add `md:hidden` timeline-style card list with: severity dot, timestamp, user, action badge, description (shown in full instead of truncated)
- Make filter select full-width on mobile

**Step 5: ClientOverviewTable mobile card view**
- Add compact mobile cards showing: name, balance badge, today's spend, action buttons (always visible)
- Hide desktop table with `hidden md:block`

**Step 6: Page header responsiveness**
- Fix all admin page headers to stack vertically on mobile using `flex-col sm:flex-row` pattern
- Ensure action buttons go full-width on small screens

### Pattern to Follow
Each mobile card view follows the existing pattern from PaymentRequests:
```text
<!-- Mobile cards -->
<div className="flex flex-col gap-3 md:hidden">
  {items.map(item => (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <!-- Key info rows -->
      <!-- Full-width action buttons -->
    </div>
  ))}
</div>

<!-- Desktop table -->
<div className="hidden md:block overflow-x-auto">
  <Table>...</Table>
</div>
```

### Files Changed

| File | Change |
|------|--------|
| `src/pages/ClientList.tsx` | Add mobile card view, fix search width |
| `src/pages/TeamManagement.tsx` | Add mobile card view, fix search width, stack header |
| `src/pages/OrderManagement.tsx` | Add mobile card view |
| `src/pages/AuditLogs.tsx` | Add mobile card view, fix filter width |
| `src/components/dashboard/ClientOverviewTable.tsx` | Add mobile card view |
| `src/pages/AdminDashboard.tsx` | Minor spacing fixes for mobile |

