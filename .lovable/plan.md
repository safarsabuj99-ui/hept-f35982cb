

# Premium UI/UX Redesign — Bold & Dynamic

## Scope
Full visual overhaul across all four areas: Login, Admin Sidebar, Dashboard/KPIs, and Tables. Bold animation style with 3D transforms, staggered reveals, and dramatic entrances.

---

## Phase 1: Animation Foundation

### New CSS utilities (`src/index.css`)
- Add keyframes: `slide-up-fade` (staggered card entry), `scale-bounce` (spring pop-in), `gradient-shift` (animated background), `float` (subtle hover float), `blur-in` (backdrop reveal), `number-tick` (counter roll)
- Add CSS custom properties for animation delays (`--stagger-1` through `--stagger-8`)
- Add `.perspective-card` utility with `transform-style: preserve-3d` and hover 3D tilt via CSS

### Tailwind config (`tailwind.config.ts`)
- Register all new keyframes and animation classes
- Add `backdrop-blur-xl` and `perspective` utilities

---

## Phase 2: Login & Onboarding

### `src/pages/Login.tsx`
- Full-screen animated gradient background with `gradient-shift` animation (dark purple → deep blue → indigo cycle)
- Floating geometric shapes in background (CSS-only, `float` animation with varying delays)
- Card entrance: `scale-bounce` + `blur-in` combined animation on mount
- Logo: 3D rotate-in animation on load, subtle continuous float
- Input fields: focus state with glowing ring animation and label slide-up
- Button: gradient shimmer sweep on hover, press-down 3D transform on click
- Add a subtle particle/dot grid pattern behind the card using CSS `radial-gradient`

---

## Phase 3: Admin Sidebar — Collapsible with Shadcn Sidebar

### `src/components/AdminLayout.tsx` → Full rewrite using Shadcn `SidebarProvider`
- Replace custom sidebar with `<Sidebar collapsible="icon">` for icon-only collapse mode
- **Grouped sections** with `SidebarGroup`:
  - "Overview" — Dashboard
  - "Clients" — Client List, New Client
  - "Advertising" — Ad Accounts, Integrations, Campaigns
  - "Finance" — Finance, Payments, Orders
  - "System" — Team, Settings, Logs
- **Active state**: Gradient left-border indicator (3px, primary color) + background glow, animated with spring transition
- **Hover state**: 3D translate-x shift (2px right) + subtle scale(1.02) with spring easing
- **Badge animation**: Pulse + scale-bounce when count changes
- **Logo area**: Subtle breathing glow animation around the icon
- **Collapse transition**: Smooth width animation with icon rotation on trigger button
- **Mobile**: Use `SidebarProvider` mobile sheet (built-in) with slide-in from left + backdrop blur

---

## Phase 4: Dashboard & KPI Cards

### `src/components/dashboard/KpiCard.tsx`
- **Entry animation**: Staggered `slide-up-fade` with `--stagger-n` delay per card (0ms, 100ms, 200ms, 300ms)
- **3D hover tilt**: CSS `perspective(600px) rotateX/Y` based on mouse position (lightweight JS handler)
- **Glow intensify**: On hover, accent color glow increases from 7% to 20% opacity with blur expansion
- **Sparkline animation**: Draw-in effect using `stroke-dasharray` + `stroke-dashoffset` CSS animation on mount
- **Value counter**: Keep existing `useCountUp` but add a subtle blur-to-sharp transition during count

### `src/components/dashboard/DashboardHeader.tsx`
- Greeting text: Typewriter-style reveal animation (CSS steps animation)
- Stat pills: Staggered pop-in with scale-bounce
- Sync button: Rotating gradient border animation while syncing

### `src/components/dashboard/QuickActions.tsx`
- Buttons: Gradient border on hover with shimmer sweep effect
- Badge count: Spring bounce animation on update

---

## Phase 5: Tables & Data Views

### Global table enhancements (`src/components/ui/table.tsx` or wrapper)
- **Row entrance**: Staggered `slide-up-fade` on initial render (rows appear one by one, 30ms stagger)
- **Row hover**: Subtle translate-y(-1px) lift + left-border glow indicator + slight scale(1.005)
- **Loading state**: Skeleton rows with enhanced shimmer (multi-layer gradient, slightly 3D)
- **Sort animation**: Column header icon rotation with spring easing on sort toggle
- **Cell transitions**: `transition-all` on data cells so value changes animate smoothly

### Specific tables
- `ClientOverviewTable`, `ProfitabilityTable`, `DeepDiveTable`: Apply the wrapper pattern consistently

---

## Phase 6: Global Polish

### Page transitions (`src/App.tsx` or layout wrappers)
- Wrap `<Outlet />` in a fade + slide-up animation container
- Each page entrance: 200ms `blur-in` + `slide-up-fade`

### Scrollbar styling (`src/index.css`)
- Custom thin scrollbar matching the dark theme (6px, rounded, sidebar-accent color)

### Focus & interaction states
- All interactive elements: `transition-all duration-200` with cubic-bezier spring easing
- Buttons: Subtle press-down transform `scale(0.97)` on `:active`
- Cards: Universal `glow-border` upgrade with directional glow following mouse

---

## File Summary

| File | Change |
|------|--------|
| `src/index.css` | Add 8+ new keyframes, stagger variables, perspective utilities, scrollbar styles |
| `tailwind.config.ts` | Register new animations and utilities |
| `src/pages/Login.tsx` | Animated gradient background, floating shapes, 3D card entrance |
| `src/components/AdminLayout.tsx` | Rewrite with Shadcn Sidebar, grouped nav, 3D hover states, collapsible |
| `src/components/dashboard/KpiCard.tsx` | Staggered entry, 3D tilt hover, sparkline draw-in |
| `src/components/dashboard/DashboardHeader.tsx` | Typewriter greeting, animated stat pills |
| `src/components/dashboard/QuickActions.tsx` | Gradient shimmer buttons |
| `src/components/ui/table.tsx` | Row entrance stagger, hover lift, sort animation |
| `src/components/ClientLayout.tsx` | Page transition wrapper on Outlet |
| `src/components/ManagerLayout.tsx` | Same page transition wrapper |

**Implementation approach**: Pure CSS animations where possible (no external animation libraries needed). Lightweight JS only for 3D mouse-tracking tilt on KPI cards. All animations respect `prefers-reduced-motion` via media query wrapper.

