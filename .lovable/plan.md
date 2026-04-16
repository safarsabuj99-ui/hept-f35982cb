

Looking at the screenshot at 390px: buttons are too tall (h-11 = 44px), labels feel oversized, the wrapping container adds extra padding making the whole bar bulky, and "Add Account" being full primary blue dominates visually. User wants **compact + organized + optimized**.

## Plan: Compact Mobile Action Bar

### Issues at 390px (current state)
1. Buttons are ~44px tall in a 2×2 grid → bar takes ~110px vertical space
2. Wrapper `glass-card p-2.5` adds 20px extra padding = wasted real estate
3. Icon + label feel chunky; `text-[13px] font-semibold` + `gap-1.5` reads heavy
4. "Add Account" solid blue + others ghost = visual weight imbalance — Add Account screams loudest but is the least frequent action
5. 2×2 grid wastes horizontal width; a 4-across row would be more scannable

### Redesign — Compact Pill Row

**Container (mobile)**
- Switch from `grid grid-cols-2 gap-3 p-2.5` to **`flex gap-1.5 p-1.5`** — single row, 4 buttons across
- Drop the heavy `glass-card` wrapper background — use a subtle `border border-border/30 bg-card/30 backdrop-blur-md rounded-xl` (lighter)
- Keep desktop layout (`sm:flex sm:justify-end sm:gap-3 sm:p-0 sm:bg-transparent sm:border-0`)

**All 4 buttons (mobile)**
- Height: `h-9` (36px) — still tappable, much more compact than 44px
- Padding: `px-2` (was `px-3`)
- Gap icon↔label: `gap-1` (was `gap-1.5`)
- Font: `text-[11px] font-medium tracking-tight` (was `text-[13px] font-semibold`)
- Icon: `h-3 w-3` (was `h-3.5 w-3.5`)
- Radius: `rounded-lg` (was `rounded-xl` — matches new compact scale)
- Width: `flex-1` (equal share of row)
- Keep shimmer + hover-lift micro-interactions (they're cheap and premium)

**Desktop (sm+) restores comfortable size**
- `sm:h-10 sm:px-4 sm:gap-1.5 sm:text-sm sm:rounded-xl sm:flex-none`
- Icons `sm:h-4 sm:w-4`

**Visual weight rebalance**
- Demote "Add Account" from solid primary → **outlined primary** (matches the other 3 ghost-glassmorphic style). All 4 share the same visual weight system, only the **accent color** differs (success / warning / primary / primary).
- Keeps semantic clarity (color = action type) without one button screaming louder than others.

**Order (unchanged)**
Add Fund (success) → Withdraw (warning) → Transfer (primary) → Add Account (primary)

### Result at 390px
```text
┌────────────────────────────────────────┐
│ [+ Fund] [↗ Draw] [⇄ Trans] [+ Acct]  │  ← single row, ~48px tall total
└────────────────────────────────────────┘
```
vs current:
```text
┌──────────────────────────┐
│ [+ Add Fund] [↗ Withdraw]│
│ [⇄ Transfer] [+ Add Acct]│  ← 2×2, ~110px tall
└──────────────────────────┘
```
Vertical space saved: ~60px. Buttons now read as **one tidy control strip**, not a hero block.

### File to edit
- `src/pages/CashFlowManagement.tsx` — only the 4-button container block (lines ~639–842)

### Won't touch
- Dialog logic, handlers, other tables, other pages
- Desktop appearance stays premium-comfortable (only mobile gets compacted)
- All semantic colors and shimmer/hover micro-interactions preserved

### Expected impact
- Bar height: 110px → ~48px (–56%)
- Reads as one unified compact toolbar
- All 4 buttons visually equal — accent color carries meaning, not size
- Still hits comfortable 36px tap height with `flex-1` widths giving ~88px each on 390px = plenty of touch area

