

# Fix: Profit Tab Not Loading Data on First Render

## Root Cause
`ClientProfitTab` relies on `ClientDateFilter` to call `onRangeChange` on mount to trigger the initial `fetchData()`. But the mount-time `useEffect` was removed from `ClientDateFilter` (as part of the earlier date fix). The `useEffect` in `ClientProfitTab` (line 42-44) is empty — it does nothing.

Result: First click on Profit tab → loading spinner forever. Second click re-mounts the component and sometimes works due to React state quirks.

## Fix
Replace the empty `useEffect` in `ClientProfitTab` with one that calls `fetchData(dateRange)` on mount:

```typescript
useEffect(() => {
  fetchData(dateRange);
}, [clientId]);
```

This is a one-line fix in `src/components/ClientProfitTab.tsx` (lines 42-44). The `dateRange` is already initialized with today's range, so this will correctly fetch today's data on first render.

