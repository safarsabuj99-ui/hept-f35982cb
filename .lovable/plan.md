

# Redesign Campaign Analytics — Premium & Aesthetic

The current table and panel are functional but plain. This redesign applies the existing premium design system (glass-card, glow effects, gradients, count-up animations) consistently to the campaign analytics area while adding modern touches.

## Changes Overview

### 1. CampaignAnalyticsPanel — KPI Cards Upgrade
Replace the plain `<Card>` KPI summary with the existing `KpiCard` component (which already has 3D tilt, sparkline, gradient accent bar, glow-on-hover, and count-up animation). This immediately brings design parity with the main dashboard.

### 2. CampaignAnalyticsPanel — Platform Tabs Styling
- Use pill-style tabs with glassmorphic backgrounds instead of default shadcn tabs
- Add subtle platform color accents (blue for Meta, dark for TikTok, yellow for Google)
- Animated underline indicator instead of plain background toggle

### 3. DeepDiveTable — Toolbar Redesign
- Wrap search, filters, preset selector in a `glass-card` container with subtle border
- Pill-shaped search input with animated focus ring
- Preset selector pills instead of dropdown — horizontal toggle buttons with active glow
- "Set Default" star integrated into the active preset pill

### 4. DeepDiveTable — Table Styling
- **Header**: Frosted glass background with subtle gradient, uppercase tracking with lighter weight
- **Rows**: Remove the `hover:-translate-y-[1px]` from base table component for this usage — use subtle left-accent gradient on hover instead
- **Alternating rows**: Subtle even/odd pattern using `even:bg-muted/20`
- **Totals row**: Glass-card style footer with gradient top border and slightly elevated appearance
- **ROAS badge**: Add subtle glow matching the color (green glow for good, red for bad)
- **Frozen column separator**: Refined gradient line with a soft glow effect

### 5. DeepDiveTable — Mobile Cards
- Apply `glass-card` class to mobile campaign cards
- Add a subtle gradient accent on the left edge based on campaign status (green=active, red=issues)
- Metric values with slightly larger font and better hierarchy

### 6. Global Table Component Tweak
- Add a `data-campaign-table` attribute usage so we can scope styles without affecting all tables globally

## Files Changed

| File | Change |
|------|--------|
| `CampaignAnalyticsPanel.tsx` | Replace plain KPI Cards with `KpiCard` component; redesign platform tabs with pill/glassmorphic style |
| `DeepDiveTable.tsx` | Redesign toolbar (glass container, preset pills), table header (frosted glass), row hover effects, totals row styling, mobile cards with glass-card + status accent, ROAS glow badges |
| `src/index.css` | Add campaign-table specific utility classes (frosted header, row accents, ROAS glow) |

## Technical Details

- **KpiCard reuse**: Import and use existing `KpiCard` from `@/components/dashboard/KpiCard` in the panel, passing appropriate accent colors per metric
- **Preset pills**: Replace `<Select>` dropdown with a row of `<Button>` toggles styled as pills with `glass-card`-like active state and primary glow
- **Table header**: `bg-gradient-to-r from-muted/80 via-muted/60 to-muted/40 backdrop-blur-sm` on the header row
- **Row hover**: `hover:bg-gradient-to-r hover:from-primary/[0.03] hover:to-transparent` with a 2px left border accent on hover
- **Totals row**: `bg-gradient-to-r from-primary/[0.06] via-primary/[0.03] to-transparent border-t-2 border-primary/20`
- **ROAS glow**: Small `box-shadow` matching badge color for visual pop
- No new dependencies needed

