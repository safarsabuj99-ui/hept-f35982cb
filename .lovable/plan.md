

## Plan: Search in Payments, Mobile-Optimize Campaign Requests, Fix Campaigns Overflow

### 1. Add Client Search to Payments & Deposits Page

**File: `src/pages/PaymentRequests.tsx`**

- Add a `searchQuery` state variable
- Add a searchable `Input` field (matching the campaign page's search style) above the tabs, with a `Search` icon and clear button
- Filter `filteredRequests` and `filteredDeposits` by client name, transaction ID, or payment method matching the search query (case-insensitive)
- Reset pagination when search changes

### 2. Add Client Search to Campaign Requests (Admin) Page

**File: `src/pages/OrderManagement.tsx`**

- Add a `searchQuery` state variable  
- Add a search `Input` between the summary cards and the tabs
- Filter requests by client name, request title, or platform matching the search query
- Reset pagination when search changes

### 3. Mobile-Optimize Campaign Requests (Client View)

**File: `src/pages/MyCampaignRequests.tsx`**

- The page already uses mobile-friendly collapsible cards, but needs tighter spacing and better touch targets
- Reduce card padding on mobile (`p-2.5` instead of `p-3`)
- Make the collapsible trigger content more compact: move date inline with budget, use smaller text sizes
- Ensure task list items inside collapsible are compact with `p-2` and `text-xs`

### 4. Fix Campaigns Page Horizontal Overflow on Mobile

**File: `src/pages/CampaignMapping.tsx`**

- Wrap the root container with `overflow-x-hidden` to prevent horizontal scroll bleed
- Add `min-w-0` to flex children (controls bar) to prevent flex items from overflowing
- The `DateRangeFilter` "Today" button appears clipped in the screenshot — ensure the controls bar wraps properly with `flex-wrap`

**File: `src/components/client-analytics/CampaignAnalyticsPanel.tsx`**

- The platform tabs container already has `overflow-x-auto` — no change needed
- Add `overflow-hidden` to the root `div` to contain any child overflow from the DeepDiveTable

**File: `src/components/client-analytics/DeepDiveTable.tsx`**

- Ensure the table wrapper has `overflow-x-auto` with `max-w-full` so the wide table scrolls within its container rather than pushing the page width

### Technical Summary

| File | Change |
|------|--------|
| `PaymentRequests.tsx` | Add search input + filter logic (~20 lines) |
| `OrderManagement.tsx` | Add search input + filter logic (~20 lines) |
| `MyCampaignRequests.tsx` | Tighten mobile spacing (~5 lines) |
| `CampaignMapping.tsx` | Add `overflow-x-hidden`, `min-w-0` (~3 lines) |
| `CampaignAnalyticsPanel.tsx` | Add `overflow-hidden` to root (~1 line) |
| `DeepDiveTable.tsx` | Ensure `max-w-full overflow-x-auto` on table wrapper (~2 lines) |

