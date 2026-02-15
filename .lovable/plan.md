

# Dynamic Granular Permission System

## Overview
Replace the current `manager_permissions` table with a flexible JSONB-based permission system stored on the `profiles` table. This gives the Super Admin a checkbox interface to grant specific capabilities to each Manager/Employee, and enforces those permissions both in the UI and at the database level.

## What Changes

### For Super Admins
- The Team Management page gets a redesigned permission modal with grouped checkboxes under categories (Financials, Operations, System)
- A "Full Access" master toggle that enables/disables all permissions at once
- Visual feedback showing which category groups are active

### For Managers
- Sidebar navigation dynamically shows/hides based on granted permissions
- Pages and action buttons are conditionally rendered
- Database-level security prevents bypassing UI restrictions

### Workflow Example
If you create user "Rahim" and only check `can_manage_campaigns`:
- Rahim logs in and sees only the Campaign Requests board in his sidebar
- He can change campaign status from Pending to Processing
- He cannot see Finance, Settings, Client editing, or Team tabs
- Even direct API calls to finance tables are blocked by database policies

---

## Technical Details

### 1. Database Migration

Add two columns to `profiles`:

```text
profiles.permissions  (JSONB, default '{}')
profiles.is_super_admin  (BOOLEAN, default false)
```

Permission keys:
- `can_view_dashboard_stats` -- Basic dashboard view
- `can_manage_finance` -- Net Profit, Exchange Rates, Approve Funds
- `can_manage_clients` -- Create/Edit/Delete Clients
- `can_manage_campaigns` -- Update campaign statuses
- `can_manage_team` -- Add/Edit other employees
- `can_configure_system` -- API Tokens and Global Settings

Create a security-definer helper function:
```text
has_permission(user_id, permission_key) -> boolean
```
This checks `is_super_admin` first (bypass all), then looks up the specific key in the JSONB.

Update RLS policies on sensitive tables (`usd_purchases`, `agency_expenses`, `settings`, `api_integrations`) to use `has_permission()`.

### 2. Update `usePermissions` Hook

Rewrite `src/hooks/usePermissions.tsx` to:
- Fetch `permissions` JSONB and `is_super_admin` from `profiles`
- Expose a `hasPermission(key)` helper function
- If `is_super_admin` is true, all permission checks return true
- Works for both admin and manager roles

### 3. Redesign Team Management UI (`TeamManagement.tsx`)

The permission modal gets:
- A "Full Access" toggle at the top
- Grouped checkboxes under 3 categories:
  - **Dashboard**: `can_view_dashboard_stats`
  - **Financials**: `can_manage_finance`
  - **Operations**: `can_manage_clients`, `can_manage_campaigns`
  - **System**: `can_manage_team`, `can_configure_system`
- Save writes the JSONB to `profiles.permissions`
- Remove dependency on old `manager_permissions` table

### 4. Update Admin Sidebar (`AdminLayout.tsx`)

For managers accessing the admin panel (or when reusing the layout), hide nav items based on permissions:
- Hide "Finance", "Expenses", "Wallet", "Payments" if `!can_manage_finance`
- Hide "Settings", "Integrations", "System Logs" if `!can_configure_system`
- Hide "Team" if `!can_manage_team`
- Hide "Client List", "New Client", "Assign Clients" if `!can_manage_clients`

### 5. Update Manager Sidebar (`ManagerLayout.tsx`)

Map nav items to the new permission keys and filter accordingly.

### 6. Conditional Action Buttons

In pages like `ClientDetail`, `PaymentRequests`, `OrderManagement`:
- Hide "Delete Client" button if `!can_manage_clients`
- Hide "Approve Fund" button if `!can_manage_finance`
- Hide status change buttons if `!can_manage_campaigns`

### Files to Create/Modify
- **Migration SQL**: Add columns + helper function + RLS policy updates
- **Update**: `src/hooks/usePermissions.tsx` -- new JSONB-based logic
- **Update**: `src/pages/TeamManagement.tsx` -- redesigned permission modal
- **Update**: `src/components/AdminLayout.tsx` -- permission-filtered sidebar
- **Update**: `src/components/ManagerLayout.tsx` -- permission-filtered sidebar
- **Update**: `src/pages/PaymentRequests.tsx` -- conditional approve button
- **Update**: `src/pages/OrderManagement.tsx` -- conditional action buttons

