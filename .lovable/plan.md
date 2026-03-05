

# Admin Impersonate Client ("View as Client") Feature

## Problem
Admin needs to view a client's dashboard without knowing their password. Currently there's no way to do this.

## Approach
Use a **client-side impersonation** approach via URL query parameter + sessionStorage. This avoids switching Supabase auth sessions (which would log the admin out). The admin stays logged in as admin but the app renders the client dashboard scoped to the target client's data.

## How It Works

1. **"Login as Client" button** on `ClientDetail.tsx` — navigates to `/dashboard?impersonate=<clientUserId>`
2. **ProtectedRoute** — when admin has `?impersonate` param, allow access to client routes (bypass role check for admins)
3. **ClientLayout** — detect impersonation mode from sessionStorage, show a "Back to Admin" banner/button
4. **ClientDashboard + other client pages** — when impersonating, use the impersonated client ID instead of `auth.uid()` for data queries
5. **useAuth hook** — add an `impersonatingClientId` field derived from sessionStorage so all client pages can use it

## Technical Changes

### 1. Create `src/hooks/useImpersonation.tsx`
A small hook that:
- On mount, checks URL for `?impersonate=<uuid>` — if present and user role is `admin`, stores it in `sessionStorage.setItem("impersonate_client_id", id)`
- Exposes `impersonatingClientId: string | null` and `stopImpersonating()` (clears sessionStorage, navigates to `/admin/clients/<id>`)
- Returns `effectiveClientId`: either the impersonated ID or the real `user.id`

### 2. `src/pages/ClientDetail.tsx` — Add "Login as Client" Button
- Add a button (e.g., `<Eye />` icon + "View as Client") in the header area
- On click: `navigate(/dashboard?impersonate=${userId})`

### 3. `src/components/ProtectedRoute.tsx` — Allow Admin Impersonation
- If `requiredRole === "client"` and actual role is `"admin"` and sessionStorage has `impersonate_client_id`, allow through instead of redirecting

### 4. `src/components/ClientLayout.tsx` — Show "Back to Admin" Banner
- Use the impersonation hook
- If impersonating, show a colored banner at the top: "Viewing as [client name] — Back to Admin"
- Hide the Sign Out button when impersonating (admin shouldn't sign out from here)

### 5. `src/pages/ClientDashboard.tsx` — Use Effective Client ID
- Replace `user?.id` with `effectiveClientId` from the impersonation hook so queries fetch the impersonated client's data
- Same change in `MyCampaignRequests.tsx` and `ClientReports.tsx`

### 6. Data Access
Admin RLS policies already grant full read access to all tables, so queries using the impersonated client ID will work fine — the admin's auth token still has admin privileges.

## Summary

| File | Change |
|------|--------|
| `src/hooks/useImpersonation.tsx` | New hook for impersonation state |
| `src/pages/ClientDetail.tsx` | Add "View as Client" button |
| `src/components/ProtectedRoute.tsx` | Allow admin through client routes when impersonating |
| `src/components/ClientLayout.tsx` | Show "Back to Admin" banner |
| `src/pages/ClientDashboard.tsx` | Use effective client ID for queries |
| `src/pages/MyCampaignRequests.tsx` | Use effective client ID |
| `src/pages/ClientReports.tsx` | Use effective client ID |

No database changes needed — admin RLS already covers all tables.

