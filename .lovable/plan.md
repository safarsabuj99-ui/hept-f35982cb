

# Plan: Premium Mobile-First Client Portal Redesign

## Problem
Client pages (Dashboard, Reports, Campaigns) are desktop-oriented. On mobile, tables overflow, KPI cards are cramped, navigation feels clunky, and the overall experience lacks the premium feel expected by clients using phones daily.

## Changes

### 1. `src/components/ClientLayout.tsx` — Mobile-optimized header and bottom navigation

- **Shrink header** on mobile: reduce height to `h-12`, hide "AdSpend Portal" text on `xs`, show only the logo icon
- **Replace top sub-nav with a fixed bottom tab bar** on mobile (`md:hidden`): 3 icon-only tabs (Dashboard, Campaigns, Reports) with active indicator dot — like a native app
- Keep the existing top sub-nav for `hidden md:flex` (desktop only)
- Add `pb-16 md:pb-0` to main content to account for the bottom bar
- Add smooth haptic-like press animations on the bottom tabs

### 2. `src/pages/ClientDashboard.tsx` — Mobile-first financial dashboard

- **Hero balance card**: On mobile, make the balance text `text-3xl` (down from `text-4xl/5xl`), tighten padding to `p-4`
- **Platform sub-balances**: Change `grid-cols-3` to a horizontal scroll row on mobile (`flex overflow-x-auto snap-x gap-3`) with `min-w-[120px]` cards — swipeable
- **KPI cards (Spend)**: Stack vertically on smallest screens, `grid-cols-1 sm:grid-cols-2`
- **Platform donut chart**: Reduce height on mobile from 240px to 180px
- **Transaction table**: Convert to a **card-based list** on mobile (`md:hidden`) — each transaction as a compact card showing date, type badge, amount. Keep the table for `hidden md:block`
- **Payment requests table**: Same card-based mobile treatment
- **Add Funds button**: Make it full-width on mobile with larger touch target (`w-full sm:w-auto h-12 sm:h-11`)

### 3. `src/components/ClientDateFilter.tsx` — Touch-friendly date pills

- Increase button size on mobile: `h-9 text-sm` instead of `h-8 text-xs`
- Make the row horizontally scrollable with `overflow-x-auto scrollbar-hide` and `flex-nowrap` so all presets are reachable without wrapping
- Add `snap-x snap-mandatory` for smooth snapping

### 4. `src/components/client-analytics/CampaignAnalyticsPanel.tsx` — Mobile KPI and tabs

- KPI grid: Use `grid-cols-2` on mobile (already done) but reduce card padding, make font `text-xl` on mobile
- Platform sub-tabs (All/Meta/TikTok/Google): Make horizontally scrollable with `overflow-x-auto` on mobile
- The outer tabs (Live Campaigns / Overview) stay as-is

### 5. `src/components/client-analytics/DeepDiveTable.tsx` — Mobile campaign cards

- On mobile (`md:hidden`): Render campaigns as **stacked cards** instead of horizontal table rows. Each card shows: campaign name, platform badge, status, spend, results, ROAS — in a compact 2-column grid layout
- Checkboxes appear as a top-right toggle on each card
- Keep the full table for `hidden md:table` 
- Floating bulk action bar: Make it `fixed bottom-16 md:bottom-4` to sit above the mobile bottom nav

### 6. `src/pages/MyCampaignRequests.tsx` — Mobile campaign request cards

- Summary cards grid: Already `grid-cols-2 sm:grid-cols-4` — good
- Request items: On mobile, stack the date/platform/objective/amount vertically instead of horizontal flex. Make touch target larger

### 7. `src/index.css` — Mobile utility classes

- Add `.scrollbar-hide` utility to hide scrollbars on swipeable rows
- Add `.bottom-tab-bar` styles with glass background and safe-area padding (`env(safe-area-inset-bottom)`)
- Add `.mobile-card` utility for consistent card-list items on mobile

### Files Modified
- `src/components/ClientLayout.tsx` — bottom tab bar
- `src/pages/ClientDashboard.tsx` — mobile card layouts, responsive sizing
- `src/components/ClientDateFilter.tsx` — scrollable touch-friendly pills
- `src/components/client-analytics/CampaignAnalyticsPanel.tsx` — responsive tabs/KPIs
- `src/components/client-analytics/DeepDiveTable.tsx` — mobile card view
- `src/pages/MyCampaignRequests.tsx` — mobile-friendly request items
- `src/index.css` — mobile utility styles

