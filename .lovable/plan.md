

## Redesign: Premium Plan Management Page

### Current Issues
- Plain cards with no visual hierarchy or glassmorphism
- Feature list is a flat wall of text — hard to scan
- No monthly/yearly pricing toggle for visual comparison
- Missing the premium design system (glass-card, glow-border, staggered animations)
- No subscriber count per plan (useful context)
- Dialog editor feels basic

### Redesign Approach

**Single file change: `src/pages/PlatformPlans.tsx`** — full rewrite with premium aesthetics.

#### Visual Upgrades
1. **PageHeader** component with icon and gradient accent
2. **Monthly/Yearly toggle** at the top — switches displayed price across all cards
3. **Glass-card plan cards** with `glow-border` and staggered `animate-slide-up-fade` entry
4. **Popular plan** gets a gradient border highlight and "Most Popular" ribbon
5. **Pricing** — large prominent price with yearly savings badge (e.g., "Save 20%")
6. **Limits** shown as icon-bubble stat pills (Users, Accounts, Managers) with subtle backgrounds
7. **Features** — compact two-column grid with green check / muted X icons, only showing enabled features prominently (disabled collapsed under "Show all")
8. **Active subscriber count** per plan — query `organization_subscriptions` grouped by plan_id
9. **Card actions** — subtle hover-reveal edit/delete buttons in top-right corner
10. **Inactive plans** get a grayscale overlay with "Archived" badge

#### Dialog Upgrades
- **Tabs inside dialog**: "Details" | "Limits" | "Features" — instead of one long scroll
- Glass background on dialog
- Feature flags grid with category grouping (Analytics, Operations, Branding)
- Live preview card in the dialog sidebar showing how the plan will look

#### Loading State
- Use `KpiSkeletonGrid` + card skeletons with shimmer

### Technical Details
- Fetch subscriber counts: `supabase.from("organization_subscriptions").select("plan_id").then(group by plan_id)`
- Monthly/yearly toggle is local state only — just switches which price field is displayed
- All existing CRUD logic stays the same, just wrapped in premium UI
- Uses existing `PageHeader`, `glass-card`, `glow-border`, `animate-slide-up-fade` classes from the design system
- Tabs component from shadcn for dialog sections

### Files Changed
- `src/pages/PlatformPlans.tsx` — full redesign

