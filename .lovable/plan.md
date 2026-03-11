

# Fix Campaign Page: Remove Full-Page Loading on Date Change

## Problems

1. **Full-page skeleton on every date filter click** — When the user changes the date preset (Today, Yesterday, etc.), `setLoading(true)` triggers on line 30, which renders the full-page skeleton (lines 191-204) instead of just updating the table content. This makes every date change feel like a fresh page load.

2. **"Today" showing data when it shouldn't** — This is likely the same issue: the full skeleton flash makes it look like stale data is briefly shown before the new data loads. The actual date filtering logic is correct.

3. **Console warning** — `AlertDialog` inside `DeepDiveTable` is trying to pass a ref to a function component that doesn't accept refs.

## Fix

### 1. Split loading into initial load vs. data refresh (`CampaignMapping.tsx`)

Replace the single `loading` state with two states:
- `initialLoading` — true only on first mount, shows the skeleton
- `refreshing` — true during date changes, shows a subtle loading indicator (e.g., opacity reduction or a small spinner) instead of replacing the entire page

```typescript
const [initialLoading, setInitialLoading] = useState(true);
const [refreshing, setRefreshing] = useState(false);

const fetchData = useCallback(async () => {
  if (!initialLoading) setRefreshing(true);
  // ... fetch logic ...
  setInitialLoading(false);
  setRefreshing(false);
}, [dateRange]);
```

Only show the full skeleton on `initialLoading`. During `refreshing`, keep the existing content visible with a subtle opacity transition or a small loading bar.

### 2. Use `CampaignAnalyticsPanel` for design parity

The campaign page currently duplicates the KPI cards and tabs layout that `CampaignAnalyticsPanel` already provides with better styling (responsive padding, icon sizing). Replace the manual KPI cards + tabs section (lines 242-321) with:

```tsx
<CampaignAnalyticsPanel campaignRows={filteredRows} onRefresh={fetchData} />
```

This ensures exact design parity with the client-side analytics and eliminates duplicated code.

### 3. Fix AlertDialog ref warning in `DeepDiveTable`

The `AlertDialog` component wraps a function component that doesn't forward refs. Wrap it properly or use `asChild` pattern to eliminate the console warning.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/CampaignMapping.tsx` | Replace single `loading` with `initialLoading`/`refreshing`; use `CampaignAnalyticsPanel` instead of manual KPI cards |
| `src/components/client-analytics/DeepDiveTable.tsx` | Fix AlertDialog ref warning |

