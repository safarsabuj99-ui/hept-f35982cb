

## Plan: Hide KPI Subtitles on Mobile

### Change
Add `hidden sm:block` to the subtitle `<p>` tag in `KpiCard.tsx` so subtitles are hidden on mobile viewports and visible on tablet/desktop.

### Files Changed
| Action | File |
|--------|------|
| Modify | `src/components/dashboard/KpiCard.tsx` — Line 118: add `hidden sm:block` class to subtitle paragraph |

One-line change. No new props needed — subtitles will be hidden below 640px across all KpiCard usages (admin dashboard included), which is consistent with the compact mobile standard.

