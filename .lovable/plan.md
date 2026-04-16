

## Replace QuickActions buttons with a Premium Global Client Search

### What's removed
The two buttons inside `QuickActions` on the Admin Dashboard:
- "Add Funds"
- "Approve Pending"

### What replaces them
A single **premium glassmorphic search trigger** that opens a command-palette-style dialog (⌘K / Ctrl+K shortcut) for fuzzy-searching all clients. Selecting a client navigates to `/admin/clients/:userId`.

### New component — `src/components/dashboard/ClientSearchCommand.tsx`

**Trigger button (idle state)** — sits where QuickActions was:
- Full-width inside its glass-card row, max-w-md on desktop
- `h-11` glassmorphic pill: `border-border/50 bg-card/40 backdrop-blur-xl rounded-xl`
- Left: `Search` icon (muted) + placeholder text "Search clients by name, email, phone…"
- Right: `<kbd>⌘K</kbd>` hint badge (hidden on mobile)
- Premium hover: subtle border glow `hover:border-primary/40` + `hover:shadow-[0_8px_24px_-6px_hsl(var(--primary)/0.35)]`
- Soft inner gradient `from-card/60 to-card/30` for depth
- Animated `pulse-dot` micro-accent left of the kbd hint to feel "alive"

**Command dialog (open state)** — uses existing `CommandDialog` from `@/components/ui/command`:
- Search input with live fuzzy filter via cmdk (built-in)
- Results: client list with avatar circle (initials), full name, email/phone secondary, balance pill on the right (green if >0, red if <0)
- Empty state: "No clients found" with a subtle illustration-style muted message
- Grouped sections: "Clients" (top) + a "Quick Actions" group at bottom with 2 entries — "View All Clients" (→ `/admin/clients`) and "Add New Client" (→ `/admin/clients/new`) — preserves discoverability without bringing back the removed buttons
- ⌘K / Ctrl+K global shortcut to open from anywhere on the dashboard
- ESC closes; Enter on highlighted item navigates

### Data source
Reuse existing `clients` already loaded in `useAdminDashboardData` — pass them down. No new query, zero extra network. Each client object already has `user_id`, `full_name`, `balance`, and (where present) `email`/`phone`.

### Wiring
1. **`src/components/dashboard/QuickActions.tsx`** — replace entire body with the new search trigger; rename file purpose stays the same (or we replace usage and keep file as-is but render `<ClientSearchCommand>`). Cleaner: keep `QuickActions.tsx` as the host, swap its inner JSX, drop `pendingCount` & `onAddFunds` props.
2. **`src/pages/AdminDashboard.tsx`** — pass `clients` to `QuickActions`; remove `pendingCount`/`onAddFunds` props from the call. Keep `DepositFundsDialog` mounted (still triggered from elsewhere like FAB / other pages) — actually since it's only opened by the removed button, we can also remove the `depositOpen` state and the `<DepositFundsDialog>` from this page to keep it clean.
3. **`src/components/dashboard/ClientSearchCommand.tsx`** — new file containing trigger + CommandDialog logic + ⌘K listener.

### Files touched (3)
- `src/components/dashboard/QuickActions.tsx` — gutted, renders `<ClientSearchCommand clients={clients} />`
- `src/components/dashboard/ClientSearchCommand.tsx` — **new**
- `src/pages/AdminDashboard.tsx` — pass clients prop, drop deposit dialog wiring

### Won't touch
- Any other page, route, or button system
- The upgraded button variants from earlier work
- Routes — `/admin/clients/:userId` already exists ✓
- Other dashboards (Manager / Client / Platform) — scope is admin only as requested

### Premium aesthetic guarantees
- Glassmorphic surface matches existing `glass-card` language used across the dashboard
- Animated entrance: `animate-slide-up-fade` with `300ms` delay (matches removed QuickActions timing — no layout flash)
- Micro-interactions: hover lift `-translate-y-0.5`, shimmer border glow, animated pulse-dot
- Keyboard-first UX (⌘K) signals "modern power tool"
- No icon-only mystery — placeholder text guides users immediately

