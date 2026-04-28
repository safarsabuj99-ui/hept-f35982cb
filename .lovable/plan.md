# Fix: Pages blink/refresh every second during API sync

## Root cause

When a sync (Meta / TikTok / etc.) is running, it inserts hundreds of `daily_metrics` and `campaign_performance` rows per second. Three pages subscribe to those tables **without any filter and without any debounce**, and each event triggers a full refetch that flips a page-wide `loading` state back to `true` — which swaps the rendered UI for skeletons. That swap, repeated several times per second, is the "blink / refresh every second" the user sees.

`ClientDashboard.tsx` already solved this same issue (debounce + `initialLoading` ref + filtered subscription + skip `daily_metrics`). The other pages were never updated to match.

### Affected files

- `src/pages/ClientReports.tsx` — subscribes to `daily_metrics` + `campaign_performance` unfiltered, calls `fetchData()` directly, and `fetchData` does `setLoading(true)` every time.
- `src/pages/CampaignMapping.tsx` — same pattern (unfiltered `daily_metrics` + `campaign_performance`, no debounce).
- `src/pages/WalletInventory.tsx` — unfiltered `daily_metrics` listener that triggers refetch storms during sync.

`useAdminDashboardData.ts`, `ClientList.tsx`, `FinanceDashboard.tsx` already debounce correctly — leave them alone.

## The fix

Apply the same proven pattern used in `ClientDashboard.tsx` to all three pages:

1. **Debounce realtime callbacks** to ~2000–2500ms (`debounce` helper from `@/lib/debounce`) so a burst of inserts produces one refetch, not hundreds.
2. **Separate "initial load" from "background refresh"**:
   - Use an `initialLoadingRef` (or an `initialLoading` state) that is only `true` for the very first fetch.
   - Subsequent realtime-triggered refetches must NOT call `setLoading(true)` — they update data silently.
   - Skeletons render only while `initialLoading` is true; afterwards the existing UI stays mounted (optionally with a subtle `opacity-60` while refreshing, per project loading-state standards).
3. **Cancel the debounce in the effect cleanup** (`debounced.cancel()`) and `removeChannel` as today.
4. **For `ClientReports.tsx`**: also remove the redundant `daily_metrics` listener if possible (the data is per-campaign for the current client; spend totals get updated through the `campaigns` listener already used elsewhere). At minimum, keep it but heavily debounced. Decision: keep both listeners but debounced at 2500ms — preserves freshness on the report page while eliminating the blink.

## ASCII summary of the change

```text
BEFORE (every realtime event):
 sync writes row → onChange → fetchData() → setLoading(true) → skeleton flash → setLoading(false)
 (repeats hundreds of times per second)

AFTER:
 sync writes rows → onChange (debounced 2500ms) → single silent refetch → data updates in place
 (initial page load still shows skeleton exactly once)
```

## Out of scope

- No schema, RLS, or edge-function changes.
- No changes to pages that already debounce correctly.
- No new dependencies (`debounce` helper already exists in `src/lib/debounce.ts`).

## Verification after implementation

- Open Client Reports while a sync job is running → page should no longer flash skeletons; numbers update smoothly every couple of seconds.
- Open Campaign Mapping and Wallet Inventory during sync → same: no blinking.
- Initial page load still shows skeletons exactly once.
