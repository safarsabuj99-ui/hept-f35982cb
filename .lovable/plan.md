

# Redesign Campaign Analytics Panel — Premium & Modern

## Current Issues
- KPI cards use plain `Card` components instead of the premium `KpiCard` with count-up animations, gradient accents, 3D tilt hover, and sparklines that the rest of the dashboard uses
- The "Live Campaigns / Overview" top-level tabs add unnecessary nesting — the platform tabs (All/Meta/TikTok/Google) are already sufficient
- The platform tabs use basic `TabsList` styling — could be more visually distinct
- Overview section (SalesFunnel + PlatformComparison) is hidden behind a tab instead of being integrated

## Redesign Plan

### 1. Replace KPI Cards with Premium `KpiCard` Component
Use the existing `KpiCard` component (already has count-up animation, gradient accent bar, 3D tilt hover, background glow, stagger animation) instead of the plain Card markup. Each KPI gets a distinct accent color:
- Total Spend → primary (purple/blue)
- Total Results → green (`#22c55e`)
- Avg ROAS → blue (`#3b82f6`)
- Avg CPO → orange (`#f97316`)

### 2. Flatten Tab Structure — Remove "Live / Overview" Layer
Remove the outer `Tabs` (Live Campaigns / Overview). Instead:
- Platform tabs (All / Meta / TikTok / Google) sit directly below KPI cards
- Style platform tabs as pill-shaped buttons with platform-colored active states (not default gray TabsList)
- Each tab trigger gets a colored dot indicator matching the platform brand color

### 3. Integrate Overview Inline
Move `SalesFunnel` and `PlatformComparison` from a hidden tab into a collapsible section or always-visible row below the KPI cards and above the platform tabs. Use a compact 2-column grid layout so they don't take too much vertical space.

### 4. Premium Platform Tab Bar
Replace standard `TabsList` with custom styled pill buttons:
- Glassmorphic background on the tab bar
- Active tab gets a subtle gradient bottom border matching platform color
- Smooth transition animations between tabs
- Count badges use platform accent colors instead of generic secondary

## Files Changed

| File | Change |
|------|--------|
| `CampaignAnalyticsPanel.tsx` | Replace plain KPI cards with `KpiCard`, flatten tab structure, integrate overview inline, premium platform tab styling |

No database changes. No new files needed — leverages existing `KpiCard` component.

