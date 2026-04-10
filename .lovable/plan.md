

## Remove "New Client" from Sidebar & Add to Client List Page

### Changes

**`src/components/AdminLayout.tsx`**
- Remove the `{ to: "/admin/clients/new", icon: PlusCircle, label: "New Client", permKey: "can_manage_clients" }` entry from the sidebar navigation items (line 56).

**`src/pages/ClientList.tsx`**
- Add a "New Client" button next to the client count badge in the page header (around line 288). The button links to `/admin/clients/new` with a `Plus` icon, matching the existing design pattern.

No database or backend changes needed.

