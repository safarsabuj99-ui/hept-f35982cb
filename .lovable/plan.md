

# Plan: Remove Activity Log Page

Simple cleanup — the Activity Log page is redundant with System Logs.

## Changes

1. **Delete `src/pages/ActivityLog.tsx`** — Remove the entire file
2. **`src/App.tsx`** — Remove the `ActivityLog` import (line 37) and the route `/admin/activity` (line 71)

Note: The "Recent Activity" widget on the Admin Dashboard and Cash Flow page are separate components and will remain untouched — they serve a different purpose (quick glance feed, not a full page).

