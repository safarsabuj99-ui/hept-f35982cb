# Align Client Performance Analytics with Agency View

## Problem

On `/client/reports` (Performance Analytics), the campaign list shows many campaigns with all-zero metrics (mostly paused TikTok ones). The agency-side view of the same client (`/admin/clients/:id` Spend tab) only shows active campaigns plus any campaign that actually has data in the selected date range — so the two views disagree on which rows to display.

## Root cause

`src/pages/ClientReports.tsx` and `src/pages/ClientDetail.tsx` build `campaignRows` from the same data, but their final filters differ:

- **Agency (ClientDetail.tsx, ~line 404-418)** — injects only `isActiveStatus(c.status)` campaigns, then filters with:
  ```
  isActiveStatus(r.status) || spend>0 || impressions>0 || clicks>0 || results>0
  ```
- **Client (ClientReports.tsx, ~line 171-198)** — also injects paused campaigns whenever the client has the `can_resume_campaigns` permission (the legacy `can_toggle_campaigns` flag enables this by default), and the final filter keeps every `paused` / `disable` row regardless of whether it has metrics. That is what produces the long list of zero-data rows in the screenshot.

## Fix

Update `src/pages/ClientReports.tsx` so the campaign row aggregation matches the agency rule exactly:

1. Inject into `map` only campaigns where `isActiveStatus(c.status)` is true (drop the `canResume && isPaused` branch).
2. Final filter becomes: keep a row if it is active **or** has any non-zero metric (`spend`, `impressions`, `clicks`, or `results`). Remove the `canResume`-based "keep paused rows" branch.
3. Keep the existing pause/resume toggle behavior in `DeepDiveTable` untouched — paused campaigns that did spend in the selected range will still appear (because they have metrics > 0), so clients with resume permission can still flip them back on. Paused campaigns with zero data in the range will simply be hidden, matching the agency view.

No changes to data fetching, RLS, permissions, or `DeepDiveTable`. This is a pure presentation-layer alignment.

## Files to change

- `src/pages/ClientReports.tsx` — adjust the `campaignRows` `useMemo` (injection loop + final `.filter`).
