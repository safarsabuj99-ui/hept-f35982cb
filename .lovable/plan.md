

## Fix: Campaign Request Details modal overflow / cut-off

### What's wrong (from your two screenshots)

**Image 1 (works)**: Short title `"1."`, no creative URLs in tasks → fits cleanly.
**Image 2 (broken)**: Long title `"LAJBOTI/LINE PATA"` + tasks containing **very long TikTok URLs** (`https://www.tiktok.com/@alhaya567/video/7630206607942602005?is_from_webapp=1&sender_device=pc&...`) → the URL string has no whitespace, ignores `truncate`, pushes the task card wider than the modal → right side ($25.00 + Pending badge + close X) gets clipped, content visibly cut at the right edge.

### Root causes (verified in `OrderManagement.tsx`)

1. **Task creative link** (line 598-602): `<a className="...truncate">` is inside a `space-y-2` block but its parent has no `min-w-0` and no `max-w-full`. `truncate` requires a constrained parent — long URLs blow out the card width.
2. **Task header row** (line 585-597): `flex items-center justify-between` with both sides being `flex flex-wrap`. When the task name is long, both sides compete and the right side (price + status badge) gets pushed out.
3. **Top title row** (line 556-559): Status badge + long title on one line with no `min-w-0` / `truncate` → pushes the dialog's built-in close X button against the edge.
4. **DetailItem "Notes"** (line 565): Single-column full-width — fine. But for very long single-word inputs it relies on `break-words` which is OK.

### The fix (single file: `src/pages/OrderManagement.tsx`)

**1. Top title row — let title truncate, free up space for X:**
```tsx
<div className="flex items-center gap-2 min-w-0 pr-2">
  <Badge ... className="shrink-0">{label}</Badge>
  <span className="text-sm font-medium truncate">{title}</span>
</div>
```

**2. Task card header — split into 2 rows on overflow, keep price+status pinned right:**

Change the single `flex justify-between` row into a structure that:
- Lets the left side (`#1 · Product · Platform · Objective`) wrap freely with `min-w-0 flex-1`
- Keeps the right side (`$10.00 + Pending`) on its own line / right-aligned with `shrink-0 ml-auto`
- Wraps `product_name` with `truncate max-w-[180px] sm:max-w-[260px]` so very long product names don't bully the layout

**3. Creative link — actually truncate long URLs:**
```tsx
<div className="min-w-0 max-w-full">
  <a className="text-xs text-primary hover:underline flex items-center gap-1 min-w-0">
    <ExternalLink className="h-3 w-3 shrink-0" />
    <span className="truncate">{task.creative_link}</span>
  </a>
</div>
```
This is the **main fix** — wraps the anchor in a `min-w-0` container and moves `truncate` onto an inner `<span>` so the icon stays visible while the URL ellipsizes.

**4. Task card root — defensive overflow guard:**
Add `overflow-hidden` to `rounded-lg border p-3 space-y-2` so even if anything else escapes, it can't break the card width.

**5. Dialog width on bigger screens — use available room:**
Bump `max-w-2xl` → `max-w-2xl sm:max-w-3xl` so on the desktop viewport (1657px shown) the modal has more horizontal room without becoming oversized on mobile.

### Visual outcome

Before (image 2):
```
│ Completed  LAJBOTI/LINE PATA          [X]
│ #1 — TikTok Message
│ 🔗 https://www.tiktok.com/@alhaya567/video/7630206607942602005?is_from_w  ← cuts off here
│                                                              $25.00 Pe…  ← clipped
```

After:
```
│ Completed  LAJBOTI/LINE PATA                                           [X]
│ ┌───────────────────────────────────────────────────────────────────────┐
│ │ #1  MASSAGE CAMPING  [TikTok]  Message              $25.00  Completed │
│ │ 🔗 https://www.tiktok.com/@alhaya567/video/7630206607942602005?is_… │ ← truncates
│ │ MASSAGE CAMPING                                                       │
│ └───────────────────────────────────────────────────────────────────────┘
```

### Files Changed

| File | Change |
|---|---|
| `src/pages/OrderManagement.tsx` | (a) `DialogContent` width: `max-w-2xl sm:max-w-3xl`. (b) Top title row: add `min-w-0` + `truncate` on title span, `shrink-0` on status badge. (c) Task card root (line 584): add `overflow-hidden`. (d) Task header (line 585-597): wrap left side in `min-w-0 flex-1`, add `truncate max-w-[200px]` to product name, keep right cluster `shrink-0`. (e) Creative link (line 598-602): wrap in `min-w-0 max-w-full` container, move `truncate` to inner `<span>` with the icon as a sibling `shrink-0`. |

Zero logic, data, or behavior changes. Pure CSS layout hardening. Same fix pattern can be applied to `MyCampaignRequests.tsx` if you confirm it has the same symptom — but your screenshots are admin-only so I'm scoping to one file unless you say otherwise.

### Build time
~2 minutes. One file. Five small className tweaks.

