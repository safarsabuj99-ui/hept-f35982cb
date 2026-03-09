

# Plan: Remove Sync Now Button from Admin & Client Dashboards

## Changes

### `src/pages/AdminDashboard.tsx`
- Remove the `handleSyncNow` function and `isSyncing` state
- Remove `onSyncNow` and `isSyncing` props from `<DashboardHeader>`

### `src/pages/ClientDashboard.tsx`
- Remove the `handleSyncNow` function and `isSyncing` state
- Remove the Sync Now `<Button>` from the header area
- Remove unused `RefreshCw` import

### `src/components/dashboard/DashboardHeader.tsx`
- Remove `onSyncNow` and `isSyncing` from props interface
- Remove the Sync Now button JSX
- Remove unused `RefreshCw` import

