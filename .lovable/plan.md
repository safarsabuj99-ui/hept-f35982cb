

## Fix Sync Health Matrix — Overflow + Refresh Feedback + Heartbeat Bug

### Issues Identified

| # | Bug | Where |
|---|---|---|
| **1** | Text overflow — "about 17 hours ago", "23 minutes ago" wraps inside narrow Fast-Lane/Deep-Dive pills, breaking the tight grid | `SyncHealthRow.tsx` (LanePill subline) |
| **2** | **Heartbeat countdown wrong** — UI shows "Heartbeat in 23h" but actual cron fires at **6h** (we already changed `HEARTBEAT_HOURS = 6` in orchestrator, forgot to update the helper) | `healthScore.ts` line 157 hardcodes `24 - hoursSince` |
| **3** | Refresh button gives no feedback — clicking it appears to do nothing because: no spinner, no disabled state, no row opacity change. Users can't tell if it ran | `SyncHealthMatrix.tsx` Refresh button |
| **4** | "about" prefix from `formatDistanceToNow` adds noise ("about 17 hours ago") | `SyncHealthRow.tsx` ago formatter |

### Fixes (Pure Frontend, ~5 min)

**Fix 1 — Compact "ago" formatter**
Replace `formatDistanceToNow(date, { addSuffix: false })` with a tight custom formatter:
- `< 1m` → `now`
- `< 60m` → `5m`
- `< 24h` → `3h`
- `< 30d` → `2d`

Strips "about", "minutes", "hours" → fits inside narrow pills, no wrap.

**Fix 2 — Sync HEARTBEAT_HOURS constant**
Export `HEARTBEAT_HOURS = 6` from `healthScore.ts`, use it in `computeActivitySignal` instead of hardcoded `24`. Update the dormant/silent threshold accordingly:
```ts
export const HEARTBEAT_HOURS = 6;
// ...
const hoursUntilHeartbeat = Math.max(0, HEARTBEAT_HOURS - hoursSince);
if (hoursSince >= HEARTBEAT_HOURS) tier = "dormant";
```
Now "Heartbeat in 5h" matches the actual orchestrator behavior.

**Fix 3 — Visible refresh feedback**
- Add `loading` prop to `SyncHealthMatrix` (already received via parent state)
- Refresh button: show `Loader2` spinner when loading, disable click during refresh
- Add subtle `opacity-60 transition` on the rows container while refreshing
- Pass `loading` down from `SyncTab` (already tracked)

**Fix 4 — Hard text truncation safeguard**
On every "ago" / subline span, add `truncate` + `min-w-0` on parents so even if the formatter misses, no wrap happens. Reduce gap inside LanePill header from `gap-2` to `gap-1.5`.

### Files Changed

| File | Change |
|---|---|
| `src/components/settings/sync/healthScore.ts` | Export `HEARTBEAT_HOURS = 6`, use it in `computeActivitySignal`. Add `formatAgoCompact()` helper. |
| `src/components/settings/sync/SyncHealthRow.tsx` | Use `formatAgoCompact`, add `truncate min-w-0` safeguards |
| `src/components/settings/sync/SyncHealthMatrix.tsx` | Accept `loading` prop, spinner on Refresh, opacity on rows during refresh |
| `src/components/settings/SyncTab.tsx` | Pass `loading` to `SyncHealthMatrix` |

### Build Time
~5 minutes. Pure UI polish + 1 logic constant fix. Zero schema, zero edge function changes.

