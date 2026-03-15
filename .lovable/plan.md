

## Plan: Fix Ad Guard Issues — Paused Campaign Names in Logs, Overdraft-Aware Logic

### Problems Identified

1. **Paused campaign names not stored in audit logs**: The `ad-guard-check` edge function only logs "Auto-paused 3 campaigns" — it does not include the actual campaign names. After a few hours, when you look at the guard history, you see counts but no campaign names.

2. **System status doesn't persist visually**: The paused campaigns table in the UI only shows when `systemPausedCampaigns` has entries. If the data refreshes and the array is empty (e.g., after auto-resume), the history doesn't show which campaigns were paused. The audit log description is the only record, and it lacks names.

3. **Overdraft logic is wrong**: Currently, Ad Guard pauses campaigns when `balance <= threshold` regardless of overdraft. If a client has NO overdraft limit (0), the guard should only pause when balance goes negative or hits threshold. But if a client has a POSITIVE balance and no overdraft, there's no reason to pause — the current logic pauses even when balance is positive if it's below threshold (e.g., balance $3, threshold $5 → pauses even though client has money).

### Changes

**File: `supabase/functions/ad-guard-check/index.ts`**

1. **Include campaign names in audit log description**: When pausing, collect `campaign_name` from each campaign and include in the log message. Change from:
   - `Auto-paused ${pausedIds.length} campaigns for ${profile.full_name}. Balance: $${balance.toFixed(2)}`
   - To: `Auto-paused ${pausedIds.length} campaigns for ${profile.full_name}: [Campaign A, Campaign B]. Balance: $${balance.toFixed(2)} (threshold: $${pauseThreshold}).`

2. **Overdraft-aware pause logic**: Change the pause condition:
   - Current: `balance <= pauseThreshold`
   - New: If `overdraft_limit_usd > 0`, pause when `balance <= pauseThreshold` (existing behavior — they have credit, so threshold matters). If `overdraft_limit_usd === 0`, only pause when `balance <= 0` (no overdraft = don't pause until money runs out, ignore threshold). This way clients without overdraft run until balance hits zero, while clients with overdraft get the threshold protection.

**File: `src/components/AutomationConfigTab.tsx`**

3. **Parse and display campaign names from history**: Update `parseDescription()` to also extract campaign names from the log description (the part between `campaigns for ClientName:` and `. Balance:`). Show the extracted names in the history table rows.

4. **Update UI labels**: When overdraft is 0, show a note next to the threshold field: "No overdraft — guard activates only when balance reaches $0" to make the behavior clear.

### Files to Change
- `supabase/functions/ad-guard-check/index.ts` — Add campaign names to audit logs + overdraft-aware pause logic
- `src/components/AutomationConfigTab.tsx` — Parse campaign names from history descriptions + overdraft UX hint

