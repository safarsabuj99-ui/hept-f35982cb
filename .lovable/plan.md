

# Team Member Detail Page — Full Plan

## Overview
Create a dedicated **Team Detail Page** (`/admin/team/:userId`) that serves as a comprehensive management hub for any manager/employee. This page will display profile info, permission controls, assigned clients, activity history, and account status — all in one place.

## What We'll Build

### 1. New Route & Navigation
- Add route `/admin/team/:userId` → `TeamMemberDetail` component
- Make manager names in `TeamManagement.tsx` clickable links to this detail page
- Add a "Back to Team" button on the detail page

### 2. Team Member Detail Page — Tabs

**Tab 1: Profile & Info**
- Display: Full name, email, phone, business name, joined date
- Editable fields: Full name, phone, business name
- Save button to update profile
- Reset password button (calls existing `reset-client-password` edge function)
- Account status toggle (Active/Inactive) with confirmation

**Tab 2: Access Control (Permissions)**
- Role preset dropdown (Finance Manager, Campaign Manager, Full Manager, View Only, Custom)
- Full Access master toggle
- Grouped permission checkboxes (Dashboard, Financials, Operations, System) — same as current dialog but as a full-page card
- Save Permissions button
- Visual summary: "8 of 13 permissions enabled"

**Tab 3: Assigned Clients**
- Table of clients assigned to this manager (`profiles WHERE manager_id = userId`)
- Columns: Client Name, Email, Balance, Status
- Search/filter
- Unassign button per client
- "Assign Client" button — opens a dialog to pick unassigned clients and set `manager_id`

**Tab 4: Activity Log**
- Filtered audit logs for this manager (`audit_logs WHERE user_id = userId`)
- Shows recent actions: logins, permission changes, client modifications
- Date range filter
- Paginated table

### 3. Files Changed

| File | Change |
|------|--------|
| `src/pages/TeamMemberDetail.tsx` | **New** — Full detail page with 4 tabs |
| `src/App.tsx` | Add route `/admin/team/:userId` |
| `src/pages/TeamManagement.tsx` | Make manager names clickable links |

### 4. Technical Details
- Fetch profile data from `profiles` table filtered by `user_id`
- Fetch assigned clients via `profiles WHERE manager_id = :userId`
- Fetch audit logs via `audit_logs WHERE user_id = :userId`
- Reuse existing `PERMISSION_GROUPS`, `ROLE_PRESETS`, `detectPreset`, `presetToPermissions` from `usePermissions.tsx`
- No database changes needed — all data already exists in current schema

