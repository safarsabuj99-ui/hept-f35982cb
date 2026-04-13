

## Plan: Fix Mobile Overflow in Payment Approval Dialog

### Problem
In the "Per-Platform Rates" section of the Confirm Approval modal, each rate row uses `flex` with all children set to `shrink-0`, causing horizontal overflow on mobile screens. The row content (Badge + BDT amount + ÷ + Input + = + USD amount) doesn't fit in narrow viewports.

### Fix (1 file)

**`src/pages/PaymentRequests.tsx`** (lines 830-851)

Change the per-platform rate row from a single horizontal flex to a wrapped layout:
- Replace `flex items-center gap-2` with `flex flex-wrap items-center gap-1.5 sm:gap-2`
- Remove `shrink-0` from children that can safely wrap
- Reduce the input width slightly on mobile (`w-16 sm:w-20`)
- This lets the content wrap gracefully on narrow screens while staying single-line on desktop

