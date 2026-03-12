

# Powerful Team Management System — Manager/Employee Focus

## What We'll Build

### 1. Expand Manager Permission Flags
Current 6 flags are too coarse. We'll add more granular permissions:

| # | Flag | Controls |
|---|------|----------|
| 1 | `can_view_dashboard_stats` | View Dashboard & Stats (existing) |
| 2 | `can_manage_finance` | Finance, Wallet, Payments & Expenses (existing) |
| 3 | `can_manage_clients` | Create / Edit / Delete Clients (existing) |
| 4 | `can_manage_campaigns` | Manage Campaign Requests (existing) |
| 5 | `can_manage_team` | Manage Team Members (existing) |
| 6 | `can_configure_system` | API Tokens & Global Settings (existing) |
| 7 | `can_view_ad_accounts` | **NEW** — View Ad Accounts page |
| 8 | `can_approve_payments` | **NEW** — Approve/reject payment requests |
| 9 | `can_manage_expenses` | **NEW** — Log and manage agency expenses |
| 10 | `can_view_audit_logs` | **NEW** — View system audit logs |
| 11 | `can_manage_wallets` | **NEW** — Add funds, platform transfers |
| 12 | `can_view_reports` | **NEW** — View finance reports & profitability |

### 2. Role Presets (Quick-Apply Templates)
Instead of toggling 12 flags one by one, admins can pick a preset that auto-fills permissions:

| Preset | Permissions Enabled |
|--------|-------------------|
| **Finance Manager** | dashboard, manage_finance, approve_payments, manage_expenses, manage_wallets, view_reports |
| **Campaign Manager** | dashboard, manage_campaigns, view_ad_accounts, manage_clients |
| **Full Manager** | All permissions |
| **View Only** | dashboard only |
| **Custom** | Manual selection (default) |

### 3. Enhanced Team Management Page
- **Search bar** — filter managers by name/email
- **Role preset badge** — show which preset matches their current permissions (or "Custom")
- **Status toggle** — `is_active` column to deactivate managers without deleting
- **Deactivated visual** — greyed-out row with "Inactive" badge
- **Expanded permissions dialog** — grouped into 4 categories with preset dropdown at the top

### 4. Database Changes
One migration:
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
```

No new tables needed — all permissions stay in `profiles.permissions` JSONB.

### 5. Enforce New Permissions in Admin Sidebar
Update `AdminLayout.tsx` nav items to use the new granular permission keys:
- Ad Accounts → `can_view_ad_accounts`
- System Logs → `can_view_audit_logs`
- Payments → split from `can_manage_finance` to also check `can_approve_payments`

### 6. Login Gate for Deactivated Accounts
Update `ProtectedRoute.tsx` or `useAuth.tsx` to check `is_active` on the profile. If `false`, sign out and show "Account deactivated" message.

## Files Changed

| File | Change |
|------|--------|
| **Migration** | Add `is_active` boolean to `profiles` |
| `src/hooks/usePermissions.tsx` | Add 6 new permission keys, update groups, add ROLE_PRESETS |
| `src/pages/TeamManagement.tsx` | Add search, preset dropdown, status toggle, deactivation, expanded permission groups |
| `src/components/AdminLayout.tsx` | Map new nav items to granular permission keys |
| `src/hooks/useAuth.tsx` | Check `is_active` on profile load, sign out if deactivated |
| `supabase/functions/create-client/index.ts` | Accept optional `role_preset` param to set initial permissions |

