# Granular Campaign On/Off Permissions

Today, agencies grant clients a single `can_toggle_campaigns` flag that allows both pausing and resuming. We'll split this into **two independent permissions** so agencies can grant Pause-only, Resume-only, or both — without breaking existing clients.

## New permission model

Stored in `profiles.client_permissions` JSONB:

- `can_pause_campaigns` — client may turn campaigns **OFF**
- `can_resume_campaigns` — client may turn campaigns **ON**
- `can_toggle_campaigns` *(legacy)* — kept for backward compatibility; treated as both flags = true when present and the new flags are absent.

Effective flags (computed once at load):
```text
canPause  = can_pause_campaigns  ?? can_toggle_campaigns ?? false
canResume = can_resume_campaigns ?? can_toggle_campaigns ?? false
```

## Admin UI (`src/pages/ClientDetail.tsx`)

Replace the single "Campaign On/Off Control" switch with a compact card containing **3 choices** (radio-style segmented control) plus an "Off" state:

```text
[ Disabled ] [ Pause only ] [ Resume only ] [ Pause + Resume ]
```

- Selecting an option writes both `can_pause_campaigns` and `can_resume_campaigns` accordingly (and clears the legacy flag to keep the JSON tidy).
- Helper text under each option explains intent (e.g. "Client can stop spending but cannot restart paused campaigns").
- Saves immediately, with toast feedback identical to the current switch.

## Client-side enforcement

**`src/pages/ClientReports.tsx`**
- Read both flags. Pass `canPause` and `canResume` down to `CampaignAnalyticsPanel` (replacing `canToggleCampaigns`).
- Inject paused campaigns into `campaignRows` only when `canResume` is true (so resume-less clients aren't shown rows they can't act on).

**`src/components/client-analytics/CampaignAnalyticsPanel.tsx`**
- Accept `canPause` / `canResume` and forward to `DeepDiveTable`.
- Backward compat: if only the old `canToggleCampaigns` prop is supplied, treat it as both true.

**`src/components/client-analytics/DeepDiveTable.tsx`** — the core gating:
- Replace `canToggleCampaigns` with `canPause` + `canResume` in props (keep legacy prop accepted for one release).
- `isSelectable(row)`:
  - active row → selectable if `canPause || isAdmin`
  - paused/disable row → selectable if `canResume || isAdmin`
  - `guard_paused` remains admin-only (unchanged)
- Per-row toggle button (`canToggle`):
  - Show Pause icon only when row is active **and** `canPause`
  - Show Resume icon only when row is paused **and** `canResume`
- Bulk action bar:
  - "Pause All" visible only if `canPause` and selection contains active rows
  - "Activate All" visible only if `canResume` and selection contains paused rows
  - Hide the entire bar when neither permission is granted and not admin
- Confirmation dialogs unchanged; they already branch on action type.

## Backward compatibility & migration

- No DB migration required — JSONB additions only.
- Existing clients with `can_toggle_campaigns: true` continue to behave exactly as today (both pause and resume).
- When an admin opens a legacy client and changes the option, we write the new keys and remove the old key in the same update.
- Client portal code never reads the legacy key directly after this change — only the computed `canPause` / `canResume`.

## Files changed

```text
src/pages/ClientDetail.tsx                         (admin permission UI)
src/pages/ClientReports.tsx                        (read perms, row injection)
src/components/client-analytics/CampaignAnalyticsPanel.tsx  (prop forwarding)
src/components/client-analytics/DeepDiveTable.tsx  (gating + bulk bar)
```

No edge function, RLS, or schema changes. Audit-log behaviour for pause/enable actions stays intact (handled by the existing `pause-campaign` function).

## Out of scope

- Per-campaign or per-ad-account permissions (could be a future extension).
- Time-window restrictions ("client can only pause during business hours") — not requested.
