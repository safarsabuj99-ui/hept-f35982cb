

# Add Client-Level Feature Permissions

## Goal
Allow admins to control what each client can see/do in their dashboard. First permission: **campaign on/off toggle**.

## Approach

### 1. Database: Add `client_permissions` JSONB column to `profiles`
Add a new column `client_permissions jsonb NOT NULL DEFAULT '{}'::jsonb` to the `profiles` table. This stores per-client feature flags like `{"can_toggle_campaigns": true}`.

Using the existing `profiles` table avoids creating a new table — mirrors how manager `permissions` JSONB already works.

### 2. Admin UI: Permission toggles in ClientDetail.tsx
Add a new "Client Access" section (or card) in the client detail page where the admin can toggle:
- **Campaign On/Off Control** — switch that sets `client_permissions.can_toggle_campaigns`

This will be a simple Switch component that saves to the profile on change.

### 3. Pass permission to DeepDiveTable
- Add a `canToggleCampaigns?: boolean` prop to `DeepDiveTable`
- When `false`, hide the Switch toggle and bulk pause controls in the table
- `CampaignAnalyticsPanel` gets the same prop and passes it through

### 4. Client-side enforcement
- In `ClientReports.tsx` (client's view), fetch the client's own `client_permissions` from their profile and pass `canToggleCampaigns` to `CampaignAnalyticsPanel`
- Default to `false` if not set (admin must explicitly grant)

## Files Changed

| File | Change |
|------|--------|
| **Migration** | Add `client_permissions jsonb DEFAULT '{}'` to `profiles` |
| `ClientDetail.tsx` | Add "Client Access" card with toggle for `can_toggle_campaigns` |
| `DeepDiveTable.tsx` | Add `canToggleCampaigns` prop; hide switch/bulk-pause when false |
| `CampaignAnalyticsPanel.tsx` | Pass through `canToggleCampaigns` prop |
| `ClientReports.tsx` | Fetch `client_permissions` from profile, pass to panel |

