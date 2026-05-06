## Bug
The notification popup list does not scroll. In `src/components/NotificationBell.tsx` (line 230) the list is wrapped in:

```tsx
<ScrollArea className="max-h-[400px]">
```

shadcn's `ScrollArea` renders a Radix viewport with `h-full w-full`. Because the parent only has `max-h` (no explicit height), the viewport has no fixed height to scroll within — Radix never shows the scrollbar and the popup just grows / clips.

## Fix
Change the ScrollArea to use a concrete height instead of `max-h`:

```tsx
<ScrollArea className="h-[400px]">
```

For the empty state (no notifications) we don't want a forced 400px void, so conditionally render: keep the empty placeholder outside ScrollArea, and only mount `<ScrollArea className="h-[400px]">` when `filtered.length > 0`.

## File
- `src/components/NotificationBell.tsx` — adjust the list section around lines 230–306.

No other changes.
