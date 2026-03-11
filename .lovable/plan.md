

# Client Dashboard Premium Redesign

## Current State
- **ClientLayout**: Simple header bar + bottom tab nav (3 tabs: Dashboard, Campaigns, Reports)
- **ClientDashboard**: Long single-column page with greeting, date filter, financial cards, charts, transaction table, payment requests — all stacked vertically with no visual hierarchy separation
- Navigation feels flat and generic; no profile access for clients

## New Design

### 1. Redesigned ClientLayout with Premium Nav

**Header**: Glassmorphic top bar with:
- Left: Logo + "AdSpend" branding
- Center (desktop): Inline tab navigation with pill-style active indicator (gradient background + subtle glow)
- Right: Client avatar circle (initials from `full_name`), theme toggle, sign-out

**Mobile bottom bar**: Keep but upgrade with a frosted-glass backdrop, larger touch targets, and an active indicator dot under selected tab

**Add a 4th tab**: "Wallet" — moves the financial details (transactions, payment requests, deposit) to its own dedicated page, decluttering the main dashboard

### 2. Redesigned ClientDashboard — "Command Center" Layout

Split the monolithic 563-line page into a focused overview:

**Hero Section** (full-width gradient card):
- Greeting + client name (large)
- Balance prominently displayed with wallet health bar
- "Add Funds" CTA button integrated into the hero
- Last synced timestamp as a subtle pill

**KPI Strip** (horizontal scroll on mobile, grid on desktop):
- 4 compact glass cards: Total Spend (filtered), Today's Spend, Active Accounts, Runway Days
- Each with icon, value, and subtle trend indicator

**Two-Column Grid** (stacks on mobile):
- Left: Platform Spend Donut chart (existing)
- Right: Spend Trend sparkline chart (existing)

Remove transactions table and payment requests from this page — they move to the new "Wallet" tab.

### 3. New Wallet Page (`/dashboard/wallet`)

Consolidates all financial content:
- Platform sub-balances (Meta, TikTok, Google)
- Transaction history (with date filter)
- Payment requests list
- "Add Funds" button

### 4. Files Changed

| File | Change |
|------|--------|
| `src/components/ClientLayout.tsx` | Premium glassmorphic header with avatar initials, pill-style nav, add Wallet tab |
| `src/pages/ClientDashboard.tsx` | Simplify to hero + KPI strip + charts only; remove transactions/payments sections |
| `src/pages/ClientWallet.tsx` | **New** — Platform balances, transactions table, payment requests (moved from dashboard) |
| `src/App.tsx` | Add `/dashboard/wallet` route |

### 5. Design Details

- Avatar circle: Uses first letter of `full_name` with gradient background
- Active tab pill: `bg-primary/10 text-primary` with subtle `shadow-sm shadow-primary/20`
- Hero card: `bg-gradient-to-br from-primary via-primary/90 to-primary/70` with inner glassmorphic balance display
- KPI cards: Glass cards with icon bubbles matching the admin dashboard style
- All transitions: 200ms ease for tab switches, fade-in for content

