

# Redesign Client Dashboard - Premium Modern Experience

## Overview
Transform the client dashboard into a polished, premium SaaS experience with glass-morphism effects, smooth animations, a personalized greeting, and a cleaner information hierarchy that feels like a native app.

## What Changes

### 1. Personalized Welcome Header
- Fetch the client's `full_name` from the `profiles` table
- Show a greeting like "Welcome back, [Name]" with time-of-day awareness (Good morning/afternoon/evening)
- Display last synced timestamp and account status in a subtle pill
- Add a subtle gradient accent line at the top

### 2. Redesigned KPI Cards with Glass-Morphism
- Use the existing `glass-card` utility class for a frosted-glass look
- Add animated number counters that count up on load
- Balance card gets a prominent gradient background with a large, bold number
- Spend and CPR cards get subtle icon backgrounds and smoother growth indicators
- Better spacing and visual weight hierarchy

### 3. Wallet Health Section Upgrade
- Move wallet health into the balance card as an integrated element
- Add a radial/circular progress indicator instead of a flat bar
- Color transitions from green to amber to red based on runway days

### 4. Streamlined Layout
- Reorganize into clear visual sections with section labels
- "Financial Overview" section: Balance + Spend KPIs in a bento-grid layout
- "Ad Performance" section: Platform donut + Spend trend side by side on desktop
- "Activity" section: Transaction history with improved row styling
- Remove the mock "Live Creative Gallery" (uses fake data, not useful) and the simulated "Cost Per Result" card (based on fabricated click data)

### 5. Quick Action Floating Button
- Replace the static "Add Funds" button with a more prominent, styled CTA
- Add subtle hover animation and glow effect

### 6. Smooth Loading States
- Replace skeleton blocks with a shimmer animation
- Add fade-in transitions when data loads

### 7. Mobile-First Responsive Refinements
- Single-column stacked layout on mobile with proper spacing
- Cards use full width on small screens
- Touch-friendly tap targets

## Technical Details

### Files to Modify

**`src/pages/ClientDashboard.tsx`** (major rewrite)
- Add `useEffect` to fetch client profile name from `profiles` table
- Remove `LiveCreativeGallery` component and mock creative data (`generateMockCreatives`)
- Remove the simulated CPR card (fake clicks/CPR data)
- Restructure JSX into clear sections with `section-label` dividers
- Apply `glass-card` and `glow-border` classes to KPI cards
- Add CSS animation classes for number count-up effect
- Integrate wallet health bar directly into the balance card
- Add time-of-day greeting logic

**`src/components/ClientLayout.tsx`**
- Add a subtle top gradient accent bar
- Improve header with client name display (fetched via profile)
- Add smooth page transition wrapper around `<Outlet />`

**`src/index.css`**
- Add `@keyframes countUp` and `fade-in` animation utilities
- Add a premium gradient accent utility class
- Add shimmer loading animation

### Components Removed
- `LiveCreativeGallery` (inline in ClientDashboard) - uses mock data, not real
- `GrowthIndicator` for CPR - based on fabricated metrics
- `generateMockCreatives` function

### Components Kept (Enhanced)
- `WalletHealthBar` - enhanced with circular indicator
- `GrowthIndicator` for Spend - kept for real MoM spend comparison
- `SpendTrendChart` - kept as-is
- Platform donut chart - kept with improved card styling
- Transaction history table - kept with improved row styling
- Payment requests table - kept
- Deposit modal - kept as-is
- `ClientDateFilter` - kept

### Data Flow
- New query: `supabase.from("profiles").select("full_name").eq("user_id", user.id).single()` for greeting
- All existing queries remain unchanged
- No new tables or migrations needed

