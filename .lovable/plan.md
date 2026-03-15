

## Plan: Enhanced Ad Guard Tab with Campaign Details and Pro Features

**Problem:** The Ad Guard tab currently shows raw campaign IDs (UUIDs) for paused campaigns. It should show campaign names, which ad account they belong to, and add smart pro features.

### Changes

**File: `src/components/AutomationConfigTab.tsx`** — Major rewrite

1. **Fetch campaign details on mount**: Query `campaign_mappings` joined with `ad_accounts` using the stored `campaign_id` strings from `systemPausedCampaigns` to get campaign names and ad account names.

2. **Rich paused campaigns table** (replaces raw ID badges):
   - Columns: Campaign Name, Ad Account, Platform icon, Paused At timestamp
   - Grouped by ad account for clarity
   - Individual "Resume" button per campaign (removes from `system_paused_campaigns` array and sets `is_active = true`)

3. **Pro features to add:**
   - **Guard History Log**: Fetch recent `audit_logs` entries with `action_type = 'ad_guard_pause'` for this client and display as a timeline showing when campaigns were paused/resumed with balance snapshots
   - **Current Balance Display**: Calculate and show the client's live balance alongside the threshold so admins can see how close the client is to triggering the guard
   - **Selective Resume**: Instead of only "Resume All", allow resuming individual campaigns from the paused list
   - **Auto-Resume Indicator**: Show the auto-resume threshold (2x pause threshold) so admins know exactly what deposit amount will trigger automatic reactivation

### Data Flow

```text
systemPausedCampaigns (campaign_id strings)
  → query campaign_mappings WHERE campaign_id IN (...)
  → join ad_accounts for account name/platform
  → display rich table with names
```

### Files to change
- `src/components/AutomationConfigTab.tsx` — Enhanced UI with campaign details, balance display, guard history, selective resume

