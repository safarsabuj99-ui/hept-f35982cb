

# Fix Frozen Columns + Premium Drag-and-Drop UX

## 1. Freeze "Select", "Campaign", "Platform", "Delivery" Columns

These 3 data columns (+ checkbox) must be **pinned to the left** and **not draggable**. They stay visible when scrolling horizontally.

**Implementation in `DeepDiveTable.tsx`:**
- Define a `FROZEN_COLS` set: `["select", "campaign_name", "platform", "status"]`
- Prevent drag on frozen columns: skip `draggable`, `onDragStart`, `onDragOver`, `onDrop` for these IDs
- Prevent dropping INTO frozen column positions
- Apply `sticky left-*` positioning with `z-10` and background color to frozen `<TableHead>` and `<TableCell>` elements:
  - `select`: `sticky left-0`
  - `campaign_name`: `sticky left-[40px]` (after checkbox width)
  - `platform`: `sticky left-[220px]` (after campaign col)
  - `status`: `sticky left-[300px]` (after platform col)
- Add a subtle right shadow/border on the last frozen column (`status`) to visually separate frozen from scrollable area
- Ensure frozen columns are always first in `columnOrder` and cannot be reordered

## 2. Premium Drag-and-Drop UX

Current DnD is basic (opacity + border-left). Upgrade to a polished experience:

**Visual enhancements:**
- **Dragged column**: Apply a glowing highlight/scale effect instead of just opacity reduction. Add a gradient accent line at top of the dragged header.
- **Drop target**: Show an animated gradient line indicator (primary color pulse) at the insertion point instead of a plain border-left
- **Ghost preview**: Use `e.dataTransfer.setDragImage` with a styled clone for a cleaner drag ghost
- **Drop zone feedback**: Add a subtle background color shift on valid drop targets during dragover
- **Transition**: Animate column reorder with a brief CSS transition on the table headers
- **Cursor**: Use `grab` on hover, `grabbing` while dragging via CSS classes
- Add a small grip/drag icon (⠿ or GripVertical from lucide) to draggable column headers to signal they're movable

## Files Changed

| File | Change |
|------|--------|
| `DeepDiveTable.tsx` | Freeze first 3+checkbox columns with sticky positioning; exclude from drag; premium DnD styling with gradient indicators, grip icons, and animated feedback |

