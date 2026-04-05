

## Bug Fix: Auto-close sidebar on mobile navigation

### Problem
On mobile, when you tap a nav link in the sidebar, the page navigates but the sidebar stays open — requiring a manual close.

### Root Cause
The `AdminSidebarContent` component uses the shadcn `Sidebar` which renders as a `Sheet` on mobile. The `NavLink` clicks navigate the route, but nothing calls `setOpenMobile(false)` to dismiss the sheet.

### Fix
In `AdminSidebarContent`, use the `setOpenMobile` from `useSidebar()` and add a `useEffect` that watches `location.pathname` — when it changes, call `setOpenMobile(false)`.

### File: `src/components/AdminLayout.tsx`

Add after existing hooks in `AdminSidebarContent`:

```typescript
const { state, setOpenMobile } = useSidebar();

useEffect(() => {
  setOpenMobile(false);
}, [location.pathname, setOpenMobile]);
```

Add `useEffect` to the existing imports from React.

**One file changed, ~3 lines added. No visual or functional side effects.**

