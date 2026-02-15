
# Move "Assign Manager" from Sidebar to Client Detail Page

## What Changes

- **Remove** the "Assign Clients" link from the admin sidebar navigation
- **Remove** the `/admin/assign` route (the standalone page is no longer needed)
- **Add** a "Manager Assignment" dropdown directly on the **Client Detail** page header card, so you can change the assigned manager while viewing any client

## How It Will Work

On the Client Detail page (`/admin/clients/:userId`), the header card that currently shows the client's name, business, email, and phone will also display:
- A labeled "Assigned Manager" section with a dropdown selector
- The dropdown lists all users with the "manager" role
- Selecting a manager immediately saves the assignment (updates `profiles.manager_id`)
- An "Unassigned" option to remove the manager
- A toast confirmation on save

## Technical Details

### Files to Modify

1. **`src/components/AdminLayout.tsx`** (line 21)
   - Remove the nav item: `{ to: "/admin/assign", icon: UserCog, label: "Assign Clients", permKey: "can_manage_clients" }`

2. **`src/App.tsx`** (line 69)
   - Remove the route: `<Route path="/admin/assign" element={<ClientAssignment />} />`
   - Remove the `ClientAssignment` import (line 23)

3. **`src/pages/ClientDetail.tsx`**
   - Fetch all managers (users with role "manager") on page load
   - Add a "Assigned Manager" dropdown in the header Card (below the client info)
   - On change, update `profiles.manager_id` for this client and show a toast
   - Display current manager name in the dropdown

### No Database Changes
The `profiles.manager_id` column already exists and is used by the current `ClientAssignment` page. We're just moving the UI to a better location.

### Optional Cleanup
The file `src/pages/ClientAssignment.tsx` can be deleted since it will no longer be routed to, but keeping it won't cause issues.
