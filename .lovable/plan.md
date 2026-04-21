

## Fix: Modal still overflows — Dialog grid + URL truncation chain

### The real bug (not the previous one)

The previous fix added `truncate` and `min-w-0` to the URL container, but the modal **still clips on the right** (visible in your screenshot 161 — the `$5.00`, `$20.00`, and progress bar are cut at the right edge, and the dialog is shifted left of center).

Verified root cause:

**1. `DialogContent` uses CSS Grid (`grid w-full max-w-lg`)** in `src/components/ui/dialog.tsx`. CSS Grid items default to `min-width: auto`, meaning **a long unbreakable string (the TikTok URL) forces the implicit grid track wider than `max-w-3xl`**. The dialog then becomes wider than its declared max-width, and `translate-x-[-50%]` shifts this wider element off-center to the left → right side gets clipped.

**2. The `<a>` truncation chain is broken**: line 600 has `<a className="...flex items-center gap-1 min-w-0">` with an inner `<span class="truncate">`. But `<a>` is a flex container here — for the inner `<span>` to truncate, the `<a>` needs `w-full` AND its own flex parent needs `min-w-0`. Right now the `<a>` only fills its content, then expands beyond the wrapper.

### The fix (2 surgical changes, single file)

**File: `src/pages/OrderManagement.tsx`**

**Change A — line 555**: Add `min-w-0` to the dialog content wrapper so the grid track honors `max-w-3xl`:
```tsx
<div className="space-y-5 min-w-0">
```

**Change B — line 598-605**: Make the URL anchor fill its container with `w-full` so the inner span actually has bounded width to truncate against:
```tsx
{task.creative_link && (
  <div className="min-w-0 w-full">
    <a 
      href={task.creative_link} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="text-xs text-primary hover:underline inline-flex items-center gap-1 max-w-full min-w-0"
    >
      <ExternalLink className="h-3 w-3 shrink-0" />
      <span className="truncate min-w-0 block">{task.creative_link}</span>
    </a>
  </div>
)}
```

Key change: `inline-flex` + `max-w-full` on `<a>` plus `block` + `min-w-0` on the inner `<span>` — this is the proven pattern for truncating long URLs inside flex layouts.

**Change C — line 547 (insurance)**: Add `overflow-hidden` to DialogContent so even if anything else escapes, the dialog itself can't visually overflow:
```tsx
<DialogContent className="max-w-2xl sm:max-w-3xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
```

### Why this finally works

- `min-w-0` on the immediate grid child breaks the auto-min-width chain → grid track respects `max-w-3xl` → dialog stays at correct width → `translate-x-[-50%]` centers correctly → no horizontal shift.
- `inline-flex max-w-full` on `<a>` + `block min-w-0 truncate` on `<span>` → URL ellipsizes at the card's right padding instead of pushing past it.
- `overflow-x-hidden` on DialogContent → final safety net so nothing visually escapes the dialog rectangle.

### Visual outcome

```
┌─────────── Modal (centered, max-w-3xl) ──────────────┐
│ 📦 Campaign Request Details                       [X]│
│ Completed  LAJBOTI/LINE PATA                         │
│ ┌──Client──┐ ┌Total Budget┐ ┌─Submitted─┐            │
│ │ MUSA     │ │ $25.00     │ │ 4/20/2026 │            │
│ └──────────┘ └────────────┘ └───────────┘            │
│ Tasks (2)                              ▰▰▱ 2/2       │
│ ┌──────────────────────────────────────────────────┐ │
│ │ #1 MASSAGE CAMPING [TikTok] Message  $5.00 ✓Done│ │
│ │ 🔗 https://www.tiktok.com/@alhaya567/video/76… │ │ ← truncates
│ │ MASSAGE CAMPING                                 │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Files Changed

| File | Change |
|---|---|
| `src/pages/OrderManagement.tsx` | (A) Add `min-w-0` to `<div className="space-y-5">` (line 555). (B) Replace creative link block (598-605) with `inline-flex max-w-full` anchor + `block min-w-0 truncate` inner span. (C) Add `overflow-x-hidden` to DialogContent (line 547). |

Zero changes to data, logic, or any other component. Pure CSS fix on the actual root cause this time (grid auto-min-width).

### Build time
~1 minute. One file. Three className tweaks.

