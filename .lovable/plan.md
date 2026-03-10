

# Plan: Mobile-Responsive Ad Accounts Page

## Problem
The Ad Accounts page uses a wide 9-column table that overflows on mobile, forcing horizontal scrolling. The header layout with title and buttons is cramped. The screenshot confirms the table columns get cut off and the layout feels desktop-only.

## Changes

### 1. `src/pages/AdAccounts.tsx` — Full mobile redesign

**Header section (lines 193-329)**
- Stack title and action buttons vertically on mobile: title on top, buttons below as `flex flex-col sm:flex-row`
- Make "Auto-Import" and "Add Account" buttons full-width on mobile (`w-full sm:w-auto`)
- Search input: make it full-width on mobile (`max-w-md` → `w-full sm:max-w-md`)

**Table → Mobile card view (lines 341-451)**
- Keep the desktop table as `hidden md:block`
- Add a mobile card list (`md:hidden`) where each ad account renders as a compact card:
  - **Top row**: Platform badge (left) + Active switch (right)
  - **Account name** as a tappable link (primary color, with external link icon)
  - **Account ID** in mono font below the name
  - **2-column grid** for key info: Clients count, Currency, Billing type, Next Bill date
  - **Balance/threshold progress bar** shown inline when applicable (full-width within the card)
  - Integration name shown as subtle text under the platform badge
- Cards use `rounded-xl border p-4` with proper spacing between items
- Pagination stays below in both views

### Files Modified
- `src/pages/AdAccounts.tsx` — responsive header + mobile card list

