

## Fix: Client Detail Tabs Not Fully Visible on Mobile

### Problem
On mobile (390px viewport), the horizontal tab strip on the Client Detail page clips the first tab ("Profile") — the left edge is cut off. The `overflow-x-auto` scroll works but the starting scroll position hides the beginning.

### Solution
Add left-aligned scroll snap and ensure the tab list has no clipping from parent constraints. Two small CSS changes to line 481:

1. Remove `flex-nowrap` (redundant with `overflow-x-auto` + `shrink-0` children)
2. Add `-mx-1` negative margin to counteract the `p-1` padding that shifts content, or switch to `justify-start` and ensure the container doesn't constrain width
3. Add `scroll-snap-type: x mandatory` and `scroll-snap-align: start` on children for better mobile UX

### File Change
**`src/pages/ClientDetail.tsx` (line 481)**

Change the TabsList className from:
```
flex w-full overflow-x-auto scrollbar-hide flex-nowrap h-auto p-1
```
To:
```
flex w-full overflow-x-auto scrollbar-hide h-auto p-1 justify-start
```

And ensure each `TabsTrigger` has proper minimum touch targets with `min-w-fit` alongside existing `shrink-0`.

This is a single-line CSS fix — no structural or logic changes needed.

