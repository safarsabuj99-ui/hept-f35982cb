## Goal
Replace the current client-side top pill nav with an agency-style collapsible sidebar on desktop (md+). Mobile keeps the existing bottom tab bar untouched.

## Changes
**File:** `src/components/ClientLayout.tsx` (presentation only)

1. Wrap layout in `SidebarProvider` and add a new `ClientSidebarContent` component using shadcn `Sidebar` (`collapsible="icon"`) — mirrors `AdminLayout`'s structure and reuses the same premium classes (`sidebar-premium`, `sidebar-header-premium`, `sidebar-nav-active`, `sidebar-icon-bubble`, `sidebar-footer-premium`, etc.) for visual parity with agency side.
2. Hide the sidebar on mobile via `className="hidden md:flex"` on the `Sidebar` so it only appears on desktop. Mobile bottom tab bar remains exactly as is.
3. Nav items (same as current tabs):
   - Dashboard → `/dashboard`
   - Wallet → `/dashboard/wallet`
   - Campaigns → `/dashboard/campaigns`
   - Reports → `/dashboard/reports`
4. Sidebar header: brand logo + name (matches admin orb style). Sidebar footer: ThemeToggle + Sign Out icon button (when not impersonating).
5. Replace the current desktop header:
   - Desktop: thin sticky header with `SidebarTrigger`, impersonation back button (if any), and right-side controls (`NotificationBell`, avatar). Drop the centered pill nav.
   - Mobile: keep existing top header look (logo + brand + bell + theme + signout + avatar) — bottom tabs unchanged.
6. Keep impersonation banner at top, gradient accent bar, and `<main>` content/Outlet exactly the same.

## Out of scope
No changes to routes, data fetching, permissions, or the mobile bottom tab bar.