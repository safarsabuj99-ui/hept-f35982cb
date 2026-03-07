

# Replace Client Assignment UI with Client Count on Ad Accounts Page

## What Changes
On the Ad Accounts list page, the "Clients & Keywords" column currently shows the full client assignment UI (badges with names, remove buttons, and an add-client popover). This will be replaced with a simple **client count number** (e.g., "2 clients" or "—" if none).

The full client assignment UI already exists on the **Ad Account Detail page** (Clients tab), so removing it from the list view loses no functionality.

## Technical Plan

### `src/pages/AdAccounts.tsx`
1. **Rename column header** from "Clients & Keywords" to "Clients"
2. **Replace the cell content** (lines 404–467) — remove the `flex-wrap` badges, `Popover`, `UserPlus` button, and all inline assignment logic — with a simple count display:
   ```
   {accountAssignments.length > 0 ? `${accountAssignments.length} client(s)` : "—"}
   ```
3. **Remove unused state & functions**: `addClientPopover`, `newAssignClient`, `newAssignKeyword`, `assignSaving`, `addClientAssignment`, `removeClientAssignment` — these are only used in this column
4. **Remove unused imports**: `UserPlus`, `X`, `Popover`/`PopoverContent`/`PopoverTrigger` (if not used elsewhere)
5. Remove `min-w-[200px]` from the column header since a number needs much less space

