

## Mobile-Optimized Premium Action Buttons (Cash Flow)

### Issues spotted on mobile (390px viewport)
1. **Visual inconsistency** — 3 buttons use ghost/glassmorphic style, but "Add Account" uses solid primary gradient → feels mismatched
2. **Cramped 2×2 grid** — `gap-2.5` is tight at 390px, buttons feel squished
3. **Uneven heights/padding** — Withdraw uses `px-4`, Add Account uses `px-5`; icon margins differ
4. **Icon micro-rotation on Transfer is broken** — `group-hover:translate-x-0.5 group-hover:-translate-x-0` cancels itself
5. **Mobile order** — "Add Account" (the rarely-used one) is bottom-right and styled as the primary CTA; "Add Fund" (most-used daily action) should visually lead
6. **Touch targets** — `h-10` (40px) is below the 44px iOS recommendation

### Redesign (single unified system, all 4 buttons)

**Container**
- Replace `grid grid-cols-2 sm:flex sm:justify-end gap-2.5` with `grid grid-cols-2 sm:flex sm:justify-end gap-3`
- Wrap in a subtle `glass-card p-2.5 rounded-xl` container on mobile only — groups them as one premium "action bar"
- Order: **Add Fund (success) → Withdraw (warning) → Transfer (primary outline) → Add Account (primary solid)** — most-frequent first

**All buttons share**
- `h-11` (44px touch target) on mobile, `sm:h-10` on desktop
- `px-3 sm:px-4` (consistent)
- `rounded-xl` (matches container)
- `text-[13px] sm:text-sm font-semibold tracking-tight`
- `gap-1.5` between icon and label (uniform — no `mr-2` on icons)
- Same shimmer sweep span
- Same hover lift `hover:-translate-y-0.5 active:translate-y-0`
- Same transition timing `duration-300`
- Icon size `h-3.5 w-3.5 sm:h-4 sm:w-4`

**Per-button accent (only color/icon differs)**
| Button | Border | Bg gradient | Text | Icon | Glow shadow |
|---|---|---|---|---|---|
| Add Fund | `success/30` | `success/15 → success/5 → transparent` | `success` → `success-foreground` on hover | PiggyBank | success/55 |
| Withdraw | `warning/30` | `warning/15 → warning/5 → transparent` | `warning` → `warning-foreground` on hover | HandCoins | warning/55 |
| Transfer | `primary/30` | `primary/15 → primary/5 → transparent` | `primary` → `primary-foreground` on hover | ArrowLeftRight | primary/55 |
| Add Account | `primary/40` | **solid** `primary → primary/85` | `primary-foreground` always | Plus | primary/65 |

The first 3 share the glassmorphic ghost style. **Add Account** stays as the solid filled CTA but gets the same height/padding/radius/shimmer so it visually belongs to the family — it's just "filled" instead of "outline" (like a primary in a button group).

**Fix Transfer icon hover** — replace broken cancel with `group-hover:translate-x-0.5` only, plus a subtle `group-hover:scale-110`.

**Mobile-specific polish**
- Add `text-xs` label fallback if label would wrap (none should at 44px width per cell)
- Ensure no `sm:w-auto` reverts — use `w-full sm:w-auto`
- Subtle entrance: stagger `animate-slide-up-fade` with `animationDelay: 0/60/120/180ms`

### File to edit
- `src/pages/CashFlowManagement.tsx` — only lines 639–842 (the 4 button block)

### Won't touch
- Dialog content / form logic
- Other tables / pagination
- Any handler functions
- Any other page or component

### Expected result
A cohesive, premium 4-button action bar that:
- Looks like one designed unit (not 4 ad-hoc buttons)
- Hits 44px touch targets on mobile
- Maintains semantic colors (warning/success/primary)
- Has consistent spacing, icon sizing, and motion language
- Reads "Add Fund first" — matches actual usage frequency

