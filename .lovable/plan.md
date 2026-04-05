

## Smart Notification Deep-Linking

Currently, notification clicks navigate to generic pages (e.g., `/admin/clients`, `/admin/payments`) without any context. The user lands on the page and has to manually find the relevant item. This plan adds **contextual deep-links** using URL query parameters so each notification navigates to the exact right view and auto-opens the relevant dialog or highlights the relevant row.

### How It Works

Each notification's `link` field (set by DB triggers) will include query params with context. Target pages will read those params on mount and auto-trigger the appropriate action.

```text
Notification Click
  → navigate("/admin/payment-requests?highlight=abc123&action=approve")
  → PaymentRequests page reads params
  → auto-scrolls to row, opens approval dialog
```

### Changes

**Step 1: Update DB Trigger Links (Migration)**

Update 5 database functions to include contextual query params in notification links:

| Trigger | Current Link | New Link |
|---------|-------------|----------|
| `notify_on_guard_pause` (admin) | `/admin/clients` | `/admin/clients/{client_id}?tab=automation` |
| `notify_on_guard_pause` (client) | `/dashboard/wallet` | `/dashboard/wallet?highlight=guard` |
| `notify_on_guard_resume` (admin) | `/admin/clients` | `/admin/clients/{client_id}?tab=automation` |
| `notify_on_guard_resume` (client) | `/dashboard` | `/dashboard?highlight=resumed` |
| `notify_on_payment_request_created` (admin) | `/admin/payments` | `/admin/payment-requests?highlight={request_id}` |
| `notify_on_payment_status_change` (client) | `/dashboard/wallet` | `/dashboard/wallet?highlight={request_id}` |
| `notify_on_campaign_request` INSERT (admin) | `/admin/orders` | `/admin/orders?highlight={request_id}` |
| `notify_on_campaign_request` UPDATE (client) | `/dashboard/campaigns` | `/dashboard/campaigns?highlight={request_id}` |

**Step 2: Create a `useDeepLinkAction` Hook** (`src/hooks/useDeepLinkAction.ts`)

A small reusable hook that:
- Reads `highlight` and `action` from URL search params
- Returns `{ highlightId, action }` 
- Cleans up the URL params after consumption (replaces history so back button isn't affected)

**Step 3: Update Target Pages to React to Deep-Link Params**

| Page | Behavior on Deep-Link |
|------|----------------------|
| **PaymentRequests.tsx** | If `highlight` param exists: auto-switch to the tab containing that payment, scroll to and pulse-highlight the row, auto-open the approval/detail dialog |
| **OrderManagement.tsx** | If `highlight` param exists: auto-switch to correct tab, scroll to and pulse-highlight the row, auto-open the detail dialog |
| **ClientDetail.tsx** | If `tab=automation` param exists: auto-switch to the Automation tab (shows Ad Guard status) |
| **ClientWallet.tsx** | If `highlight=guard` param: show a brief toast about guard status. If `highlight={id}`: scroll to and pulse-highlight that payment request row |
| **ClientDashboard.tsx** | If `highlight=resumed`: show a success toast confirming campaigns resumed |
| **MyCampaignRequests.tsx** | If `highlight` param: scroll to and pulse-highlight the matching campaign request |

**Step 4: Add Pulse-Highlight CSS Animation** (`src/index.css`)

A subtle `@keyframes pulse-highlight` animation class that briefly glows a row's background (2-3 pulses over 2 seconds) then fades, drawing the user's eye to the exact item.

### Files Changed (~9 files)

| File | Change |
|------|--------|
| **Migration SQL** | Update 5 trigger functions with contextual links |
| **New: `useDeepLinkAction.ts`** | Reusable hook for reading & consuming URL params |
| `PaymentRequests.tsx` | Auto-open approval dialog on deep-link |
| `OrderManagement.tsx` | Auto-open detail dialog on deep-link |
| `ClientDetail.tsx` | Auto-switch to automation tab on deep-link |
| `ClientWallet.tsx` | Highlight payment row or show guard toast |
| `ClientDashboard.tsx` | Show resumed toast on deep-link |
| `MyCampaignRequests.tsx` | Highlight campaign request row |
| `index.css` | Add pulse-highlight animation |

### What Stays Unchanged
- Notification bell component (already calls `navigate(notif.link)`)
- Notifications page (already calls `navigate(notif.link)`)
- Notification data model (still uses the existing `link` text column)

