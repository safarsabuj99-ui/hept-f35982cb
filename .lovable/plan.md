

## Notification Badge Detached From Bell Icon — Fix

### Root Cause

In `src/components/ui/button.tsx` line 9, the base Button class includes `overflow-hidden` (used for the shimmer sweep effect via `::before`). This clips the notification badge in `NotificationBell.tsx` (positioned at `-top-0.5 -right-0.5`, i.e. **outside** the button's 36×36 box). The visible "fragment" of the badge appears detached from the bell icon — exactly what the screenshot shows.

Additionally:
- The badge inherits `[&_svg]:size-4` rules and is rendered inside an `overflow-hidden` button — fragile.
- The `Bell` icon is `h-4 w-4` (16px) inside an `h-9 w-9` (36px) button — the icon is centered, but the badge is positioned off the button edge, making the visual gap look ~20px even when not clipped.

### Fix Strategy (Minimal, Surgical)

Restructure the bell trigger so the badge stays visually anchored to the bell icon and is **not clipped** by `overflow-hidden`.

**Option chosen**: Wrap the bell + badge in an inner `<span class="relative">` so the badge anchors to the icon (not the button), and keep the badge **inside** the icon box (not negative offsets). This makes it visually attached regardless of button size or `overflow-hidden`.

### Patch (single file)

`src/components/NotificationBell.tsx` — replace the `<PopoverTrigger>` block (lines 115–127):

```tsx
<PopoverTrigger asChild>
  <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-lg press-effect">
    <span className="relative inline-flex">
      <Bell className="h-4 w-4" />
      {unreadCount > 0 && (
        <span className={cn(
          "absolute -top-1.5 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-destructive-foreground ring-2 ring-card animate-in zoom-in-50",
          urgentCount > 0 ? "bg-destructive notif-urgent-badge" : "bg-primary"
        )}>
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </span>
  </Button>
</PopoverTrigger>
```

### Why This Works

| Issue | Before | After |
|-------|--------|-------|
| Badge clipped by `overflow-hidden` | Badge sits at button edge → clipped | Badge sits next to icon, well inside button bounds |
| Visual gap between bell and "1" | ~20px (button width) | ~2px (touching the icon) |
| Z-index conflict with shimmer `::before` | Possible | `z-10` via `[&>span]:z-10` rule already in Button base |
| Badge hidden when count = 0 | ✅ | ✅ (preserved) |
| Urgent vs normal color | ✅ | ✅ (preserved) |
| 99+ overflow logic | ✅ | ✅ (preserved) |

### Scope

- Used in 4 layouts (Admin, Client, Manager, Platform) — single component fix covers all.
- No CSS changes, no Button changes, no behavioral regressions.
- Mobile + desktop both fixed (same component, same bell).

### Verification After Fix

The "1" badge will appear as a small pill **touching the top-right of the bell icon**, exactly like Gmail/Slack — no detached floating number.

### Build Time
~2 minutes. One file. One block.

