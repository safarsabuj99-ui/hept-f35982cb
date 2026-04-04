

## Searchable Client Dropdown with Smooth Scroll

### Problem
The Client filter on the Campaigns page uses a basic `<Select>` dropdown with no search. With 10+ clients, finding one requires scrolling through the full list. The Radix Select scroll also has known jank on mobile/touch devices.

### Solution
Replace the `<Select>` with a **Popover + Command** (combobox) pattern — the same approach used by shadcn/ui's combobox example. This gives:
- A **search input** at the top to filter clients by name instantly
- **Smooth native scroll** via cmdk's virtualized list (no Radix Select scroll buttons)
- Same visual style as the current dropdown (glass border, dark theme)

### Changes

**1 file modified: `src/pages/CampaignMapping.tsx`**

- Replace the `Select`/`SelectContent`/`SelectItem` import with `Popover`/`PopoverTrigger`/`PopoverContent` + `Command`/`CommandInput`/`CommandList`/`CommandEmpty`/`CommandGroup`/`CommandItem`
- The trigger button keeps the same `w-44 h-9 text-sm` styling with a chevron icon
- Inside the popover:
  - `CommandInput` with placeholder "Search clients..."
  - `CommandList` with `max-h-[280px] overflow-y-auto` and CSS `scroll-behavior: smooth` + `-webkit-overflow-scrolling: touch`
  - `CommandEmpty` showing "No client found"
  - `CommandGroup` with "All Clients" item + mapped client items
  - Check icon on the selected item
- Popover closes on selection, value updates as before
- Add `overscroll-behavior: contain` to prevent page scroll bleed when list hits bottom

