
# Remove "Log Spend" Feature

Since ad spend is now automatically collected from ad accounts via the sync system, the manual "Log Spend" page is redundant.

## Changes

### 1. Remove the Log Spend page file
- Delete `src/pages/LogSpend.tsx`

### 2. Remove routes from `src/App.tsx`
- Remove the `import LogSpend` line
- Remove the `/admin/log-spend` route
- Remove the `/manager/log-spend` route

### 3. Remove nav item from `src/components/AdminLayout.tsx`
- Remove the `{ to: "/admin/log-spend", icon: TrendingDown, label: "Log Spend" }` entry
- Remove the unused `TrendingDown` icon import if no longer needed

### 4. Remove nav item from `src/components/ManagerLayout.tsx`
- Remove the `{ to: "/manager/log-spend", icon: TrendingDown, label: "Log Spend", permKey: "can_log_spend" }` entry
- Remove the unused `TrendingDown` icon import if no longer needed

### 5. Clean up permissions (optional)
- The `can_log_spend` permission in `manager_permissions` table becomes unused but can remain harmlessly in the database for now

---

**Total: 1 file deleted, 3 files modified** -- a straightforward removal with no side effects since spend data now flows automatically through the sync engine.
