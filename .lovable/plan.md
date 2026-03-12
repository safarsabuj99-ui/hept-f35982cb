

# Attention Required — Dedicated Page

## What We'll Build
Create a new **Attention Required** page at `/admin/attention` with a nav entry in the sidebar, reusing the existing sub-widgets (LowBalanceAlerts, SystemHealthWidget, UnassignedSpendAlert, BillingHealthWidget) but laid out as full-width sections instead of compact tabs.

## Changes

### 1. New page: `src/pages/AttentionRequired.tsx`
- Full page with a header ("Attention Required") and four sections displayed as separate cards (not tabs), each with its own heading: **Low Balance Alerts**, **System Health**, **Unassigned Spend Risks**, **Billing Health**.
- Reuses the existing components: `LowBalanceAlerts`, `SystemHealthWidget`, `UnassignedSpendAlert`, `BillingHealthWidget`.

### 2. `src/components/AdminLayout.tsx`
- Add a new nav item in the top (dashboard) section or a new "Operations" section:
  ```
  { to: "/admin/attention", icon: AlertTriangle, label: "Attention", permKey: "can_view_dashboard_stats" }
  ```
- Import `AlertTriangle` from lucide-react (already imported in AttentionPanel).

### 3. `src/App.tsx`
- Import the new `AttentionRequired` page.
- Add route: `<Route path="/admin/attention" element={<AttentionRequired />} />` inside the admin route group.

No database changes needed.

