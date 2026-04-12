

## Plan: Optimize Wallet & USD Page for Mobile View

### Issues (visible in screenshot at 390px)

1. **USD Inventory Card header is cluttered** — "Since 2026-04-12" badge, "Auto: Every 5 min" badge, and "Refresh" / "Close Period" buttons all sit in a single horizontal row, causing overflow and text clipping on mobile.

2. **Overview grid `grid-cols-2 lg:grid-cols-6`** — 6 metric boxes crammed into 2 columns on mobile with large `text-xl sm:text-2xl` fonts creates a tall, hard-to-scan card. The "Burn / Runway" box has two lines stacked awkwardly.

3. **Action buttons ("Spend USD" / "Buy USD")** at the top use `flex items-center gap-2` with no wrapping — they can clip on narrow screens.

4. **DateRangeFilter presets** — "Today / Yesterday / This Week" pill row clips off-screen (visible in screenshot: "day" is cut).

5. **Bottom obligations row** — `flex flex-wrap` with long text can still overflow on 390px.

### Changes

**File: `src/pages/WalletInventory.tsx`**

1. **Card header — stack on mobile**: Wrap the title + badges and the action buttons into `flex flex-col sm:flex-row`. Badges wrap below the title on mobile. Buttons (`Refresh`, `Close Period`) go full-width below on mobile.

2. **Overview grid — use `grid-cols-3` on mobile instead of `grid-cols-2`**: Change `grid-cols-2 lg:grid-cols-6` → `grid-cols-3 lg:grid-cols-6`. This fits all 6 metrics in 2 rows of 3, reducing card height. Reduce font sizes on mobile: `text-lg sm:text-2xl` instead of `text-xl sm:text-2xl`.

3. **Top action buttons** — change to `grid grid-cols-2 sm:flex` so they sit side-by-side compactly on mobile with equal widths.

4. **Obligations row** — use `flex-col sm:flex-row` so each metric sits on its own line on mobile.

5. **Minor spacing** — reduce `space-y-6` → `space-y-4` on the root container for tighter mobile layout.

### Files Changed
- `src/pages/WalletInventory.tsx` — responsive layout fixes for mobile

