

# Team Management and Granular Permissions for Super Admin

## Overview
Add a dedicated "Team Management" page for the Super Admin to create, view, edit, and control manager/employee accounts with granular permissions -- specifying exactly what each team member can view and do.

## What You'll Get

1. **Team Management Page** -- A new page at `/admin/team` listing all managers with their status, assigned client count, and permission summary.

2. **Create Manager/Employee** -- The existing "New Account" form already supports creating managers. We'll link it from the team page and keep it consistent.

3. **Granular Permission Controls** -- For each manager, the Super Admin can toggle:
   - **View Permissions**: See client dashboards, see transaction history, see financial summaries
   - **Action Permissions**: Add funds (creates pending approval), log daily spend, edit client profiles

4. **Permission Enforcement** -- Managers will only see navigation items and UI controls matching their assigned permissions.

## Technical Details

### Database Changes

**New table: `manager_permissions`**

```text
+---------------------+----------+---------+----------------------------------+
| Column              | Type     | Default | Description                      |
+---------------------+----------+---------+----------------------------------+
| id                  | uuid     | auto    | Primary key                      |
| user_id             | uuid     | --      | The manager's user ID            |
| can_view_dashboard  | boolean  | true    | Can view assigned client boards   |
| can_view_transactions| boolean | true    | Can see transaction history       |
| can_add_funds       | boolean  | true    | Can submit fund deposits          |
| can_log_spend       | boolean  | true    | Can log daily ad spend            |
| can_edit_clients    | boolean  | false   | Can edit client profile info      |
| updated_at          | timestamp| now()   | Last modified                    |
+---------------------+----------+---------+----------------------------------+
```

- RLS: Only admins can read/write. Managers can read their own row.
- A row is auto-created when a manager account is created (via trigger or edge function update).

### New Files

1. **`src/pages/TeamManagement.tsx`** -- Main team listing page with:
   - Table of all managers (name, email, assigned clients count, permission summary)
   - "Edit Permissions" button per row opening a dialog
   - Permission toggle dialog with switches for each capability
   - Link to create a new manager

2. **`src/hooks/usePermissions.tsx`** -- Hook that fetches the current manager's permissions and exposes boolean flags. Used by ManagerLayout and manager pages to show/hide features.

### Modified Files

3. **`src/components/AdminLayout.tsx`** -- Add "Team" nav item linking to `/admin/team`.

4. **`src/App.tsx`** -- Add route `/admin/team` pointing to `TeamManagement`.

5. **`src/components/ManagerLayout.tsx`** -- Use `usePermissions` hook to conditionally show/hide nav items (Add Funds, Log Spend) based on the manager's permissions.

6. **`src/pages/AddFunds.tsx`** -- Check `can_add_funds` permission; show "no access" message if disabled.

7. **`src/pages/LogSpend.tsx`** -- Check `can_log_spend` permission; show "no access" message if disabled.

8. **`supabase/functions/create-client/index.ts`** -- After creating a manager, also insert a default row into `manager_permissions`.

### User Flow

```text
Super Admin -> Team Management page
  |
  +-> Sees list of all managers with permissions summary
  |
  +-> Clicks "Edit Permissions" on a manager
  |     -> Dialog with toggle switches for each permission
  |     -> Save updates the manager_permissions table
  |
  +-> Clicks "New Manager" -> goes to /admin/clients/new (pre-set to manager)
```

### Permission Enforcement

- **UI Level**: ManagerLayout hides nav items the manager doesn't have access to. Individual pages check permissions and show a friendly "You don't have access" card if disabled.
- **Database Level**: RLS on transactions already restricts managers to their assigned clients. The permissions add an application-level layer for feature access within that scope.

