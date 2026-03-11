

# Admin Profile — Show Name + Profile Settings Page

## Problem
The dashboard header shows `raohas10` (email prefix) because it does `user?.email?.split("@")[0]`. A `profiles` table already exists with `full_name`, `business_name`, `email`, `phone`, etc. — it just isn't being fetched.

## Plan

### 1. Create a `useProfile` hook
New file: `src/hooks/useProfile.tsx`
- Fetches the current user's profile from `profiles` table on mount
- Returns `{ profile, loading, refetch }`
- Exposes `full_name`, `business_name`, `email`, `phone`

### 2. Update DashboardHeader to show profile name
**File:** `src/components/dashboard/DashboardHeader.tsx`
- Use `useProfile` hook
- Display `profile?.full_name || email prefix` as the greeting name

### 3. Create Admin Profile page
New file: `src/pages/AdminProfile.tsx`
- Editable form with fields: Full Name, Company/Business Name, Email (read-only from auth), Phone
- Fetches current profile data on load, saves updates to `profiles` table
- Clean card-based layout matching the Settings page style

### 4. Add route and nav link
**File:** `src/App.tsx` — Add `/admin/profile` route
**File:** `src/components/AdminLayout.tsx` — Add "Profile" nav item under SYSTEM section (with User icon)

### Files Changed

| File | Change |
|------|--------|
| `src/hooks/useProfile.tsx` | New hook to fetch/cache current user's profile |
| `src/components/dashboard/DashboardHeader.tsx` | Use profile `full_name` for greeting |
| `src/pages/AdminProfile.tsx` | New profile settings page with editable form |
| `src/App.tsx` | Add `/admin/profile` route |
| `src/components/AdminLayout.tsx` | Add Profile nav link |

