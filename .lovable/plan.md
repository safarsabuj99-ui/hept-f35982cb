# Plan: Client-side Campaign Resume (Turn ON)

## Current behavior
- Admin grants `client_permissions.can_toggle_campaigns` per client (ClientDetail → Client Access).
- `ClientReports` reads that flag and passes `canToggleCampaigns` to `CampaignAnalyticsPanel` → `DeepDiveTable`.
- In `DeepDiveTable`:
  - The pause/enable Switch and bulk-select treat **paused rows as selectable only when `isAdmin === true`**.
  - Clients can therefore only PAUSE active campaigns — never resume paused ones.
- `ClientReports.campaignRows` filters out paused rows that have no spend/impressions in the selected range, so paused campaigns are often invisible to the client.

## Goal
When the agency enables "Campaign On/Off Control" for a client, the client should be able to **both pause active campaigns and resume paused campaigns** from their dashboard — using the same secure `pause-campaign` edge function that's already in place. No new admin toggle required (one permission = full on/off control), keeping the UX simple.

## Changes

### 1. `src/components/client-analytics/DeepDiveTable.tsx`
Treat `canToggleCampaigns` as full bidirectional control (no `isAdmin` requirement for resuming):
- Row Switch (`canToggle` calc on line ~167 and ~692): already allows both directions when `canToggleCampaigns` is true — verify and keep.
- `selectableRows` (line ~460): allow paused rows when `canToggleCampaigns` is true (drop the `isAdmin` gate for paused).
- `isSelectable` checks (lines ~640, ~1107): same — `canToggleCampaigns && (active || paused)`.
- Bulk action bar (line ~1384, ~1399): show **both** "Pause Selected" and "Enable Selected" bulk buttons whenever `canToggleCampaigns` is true (currently `hasActive` gate only). Add a `hasPaused` mirror that drives a bulk-enable button reusing the existing per-row enable logic (loop `pause-campaign` with `action: "enable"`).
- Confirm dialog copy: keep dynamic ("This will pause…" / "This will enable…") — already action-aware.

### 2. `src/pages/ClientReports.tsx`
Make paused campaigns visible to clients who have permission so they have something to turn back on:
- In the `campaignRows` `useMemo` filter (line ~182), when `canToggleCampaigns` is true, also include paused campaigns from the `campaigns` list (inject paused rows similar to the existing active-injection block above it). When the permission is off, keep the current active-only behavior so the report stays clean.
- Inject all paused campaigns (not just those with spend) so they're toggleable; show them with status badge that DeepDiveTable already renders ("paused" / "guard paused").

### 3. `src/pages/ClientDetail.tsx` (admin)
Refresh the description so the agency understands the toggle now covers both directions:
- "Allow client to **pause and resume** campaigns from their dashboard." (current copy already says "pause and enable" — minor wording polish to "pause and resume").

### 4. Edge function / RLS — no changes needed
`pause-campaign` already accepts `action: "pause" | "enable"` and authorizes via the caller's session. Clients can already invoke it (DeepDiveTable does). RLS on `campaigns` lets the client read their own rows; the edge function performs the platform call and DB update with service role.

## Out of scope
- Splitting into two separate permissions (pause-only vs resume-only). One unified "On/Off Control" flag stays simpler and matches the existing UI label.
- Guard-paused campaigns: keep the existing automation flow (resume-window) — clients won't be able to resume `guard_paused` rows here; those still go through the AutomationConfigTab top-up flow.

## Files touched
- `src/components/client-analytics/DeepDiveTable.tsx` — selection + bulk-enable button
- `src/pages/ClientReports.tsx` — surface paused campaigns when permission is on
- `src/pages/ClientDetail.tsx` — minor copy polish
