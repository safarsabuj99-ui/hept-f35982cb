## Goal

On the Campaigns analytics table (`DeepDiveTable`), two mobile issues:

1. **Missing "Select all / Select active" control on mobile.** Desktop has a header checkbox to select all selectable rows on the page, but the mobile card view has no equivalent — users have to tap each card one-by-one.
2. **Scroll jumps to the top when toggling a checkbox.** When you tap the checkbox on the bottom card and then continue selecting, the page scrolls back to the first campaign.

## Root cause of the scroll bug

In `src/components/client-analytics/DeepDiveTable.tsx` (line ~837), the `MobileCampaignCard` component is defined **inside** the `DeepDiveTable` function body. Every time `selectedIds` (or any other state) updates, a brand-new `MobileCampaignCard` function reference is created, so React treats every card as a different component type and unmounts/remounts the whole list. The remount destroys/recreates DOM nodes on each tap, which makes the browser reset scroll near the top of the freshly-mounted list.

Fix: stop redefining the card component on every render. Move it out of the parent function (or wrap with `React.memo`) so taps only re-render the card whose `isSelected` actually changed, leaving the list DOM stable and scroll position intact.

## Changes

**File: `src/components/client-analytics/DeepDiveTable.tsx`**

1. **Extract `MobileCampaignCard` out of the component body.**
   - Move it to a top-level component in the same file.
   - Pass the values it currently closes over as props: `row`, `selectedPreset`, `canToggleCampaigns`, `isAdmin`, `togglingId`, `isSelected`, `isSelectable`, `onToggleSelect`, `onToggleCampaign` (opens confirm dialog).
   - Wrap with `React.memo` so a card only re-renders when its own `isSelected` / `togglingId` / `row` actually changes.

2. **Add a mobile bulk-select toolbar above the card list.**
   - Render only on mobile (`md:hidden`), only when `paginatedData` has at least one selectable row.
   - Layout: a small pill/bar with:
     - A tri-state `Checkbox` (checked / indeterminate / unchecked) bound to the same `toggleSelectAll` already used by the desktop header.
     - Label: "Select all on page" (shows count of selectable rows, e.g. "Select all (8)").
     - A secondary text button "Active only" that selects only the active selectable rows on the current page (uses existing `isActiveStatus` helper). Hidden when there are no active rows on the page.
   - Reuses the existing `selectableRows` memo and `selectedIds` state — no new selection logic.

3. **Keep the existing floating bulk action bar** (Pause All / Activate All / Clear) unchanged — it already works on mobile via `bottom-16` sticky positioning.

## Visual layout (mobile)

```text
┌──────────────────────────────────────┐
│ Search…             [Status] [Preset]│  ← existing toolbar
├──────────────────────────────────────┤
│ [☐] Select all (8)      Active only  │  ← NEW mobile select bar
├──────────────────────────────────────┤
│ [☐] Campaign A           [Meta]      │
│      • active            ───●        │
│      Spend  $12.34 …                 │
├──────────────────────────────────────┤
│ [☑] Campaign B           [TikTok]    │
│ …                                    │
└──────────────────────────────────────┘
        ┌─────────────────────────┐
        │ 2 selected   Clear  Pause All │  ← existing floating bar
        └─────────────────────────┘
```

## Out of scope

- No backend changes.
- No changes to desktop table behavior, pagination, or bulk pause/activate flow.
- No styling overhaul — only adds one small bar and reuses existing components (`Checkbox`, `Button`).

## Acceptance criteria

- On mobile (≤ md), a "Select all" checkbox bar appears above the cards and selects/deselects all selectable rows on the current page; tri-state behavior matches desktop.
- "Active only" button selects just the active campaigns on the current page.
- Tapping a checkbox on a card near the bottom of the list no longer scrolls the page back to the first card; scroll position stays put.
- Desktop behavior unchanged.
