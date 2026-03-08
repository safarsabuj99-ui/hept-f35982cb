

# Hide Auto-Spend from Dashboard + Add Activity Page

## Changes

### 1. `src/components/dashboard/RecentActivityFeed.tsx`
- Filter out transactions where `description` starts with `auto_spend:` so they don't appear in the dashboard Recent Activity widget

### 2. New page: `src/pages/ActivityLog.tsx`
- Full activity page showing ALL transactions including auto_spend entries
- Table/list view with filters, showing type, description, amount, date, status
- Auto-spend rows displayed with a distinct "Auto" badge for clarity

### 3. `src/components/AdminLayout.tsx`
- Add "Activity" nav item under the "Overview" section with an `Activity` icon, linking to `/admin/activity`

### 4. `src/App.tsx`
- Add route: `<Route path="/admin/activity" element={<ActivityLog />} />`

