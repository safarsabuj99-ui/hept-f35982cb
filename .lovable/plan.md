

## Plan: Fix Platform Owner Login & Build Platform Panel

The login fails because three things are missing:

1. **`AppRole` type excludes `"platform_owner"`** — the role is fetched from the database but doesn't match the TypeScript type, so it's effectively `null`
2. **No `/platform` routes exist** in `App.tsx` — there's nowhere to redirect to
3. **No platform pages or layout were created** — the previous implementation was interrupted

### Changes Required

**1. Update `src/hooks/useAuth.tsx`**
- Add `"platform_owner"` to the `AppRole` type

**2. Update `src/pages/Login.tsx`**
- Add `platform_owner` redirect: `navigate("/platform")`

**3. Update `src/components/ProtectedRoute.tsx`**
- Add `platform_owner: "/platform"` to `roleHomeMap`

**4. Create `src/components/PlatformLayout.tsx`**
- Sidebar navigation: Dashboard, Agencies, Billing, Plans
- Platform Owner branding, sign-out button

**5. Create platform pages:**
- `src/pages/PlatformDashboard.tsx` — KPIs (total agencies, MRR, active/trial counts)
- `src/pages/AgencyList.tsx` — List all organizations with status, plan, usage stats
- `src/pages/CreateAgency.tsx` — Form to create a new agency (calls `create-organization` edge function)
- `src/pages/AgencyDetail.tsx` — View/manage single agency (change plan, suspend, usage)
- `src/pages/PlatformBilling.tsx` — Subscription payment tracking
- `src/pages/PlatformPlans.tsx` — View/manage plan tier definitions

**6. Update `src/App.tsx`**
- Add `/platform/*` routes wrapped in `ProtectedRoute` with `requiredRole="platform_owner"`

### Implementation Order
1. Auth fixes (useAuth type, Login redirect, ProtectedRoute) — gets login working immediately
2. PlatformLayout + PlatformDashboard — first page to land on
3. AgencyList + CreateAgency — core management functionality
4. AgencyDetail, PlatformBilling, PlatformPlans — remaining pages

