

## Plan: Smart Ad Guard Status — Clear on Deposit, Show Only When Unpaid

### Problem
From the screenshot: even after a client deposits funds, the Ad Guard still shows "Locked / Window expired" status with the negative balance. The user wants:
- **When client deposits and balance becomes positive** → clear the locked/paused status entirely, resume campaigns, show "Active"
- **Only show paused/locked status when client hasn't paid** (balance still below threshold)

### Root Cause
The `check_auto_resume()` DB trigger currently treats window expiry as permanent — after the window expires, it clears `system_paused_campaigns` but does NOT resume campaigns, even if the client deposits. The logic should be: **if balance is sufficient after a deposit, always resume campaigns regardless of whether the window expired.**

### Changes

**1. Database: Update `check_auto_resume()` function**

Change the logic order:
- First check if balance is sufficient (> 2× threshold). If yes → **always resume campaigns + clear guard state**, regardless of window expiry
- Only apply the window-expiry lock logic when balance is still insufficient

```sql
-- New logic flow:
IF v_balance > (v_pause_threshold * 2) THEN
  -- Client paid enough → resume everything, clear guard state
  UPDATE campaign_mappings SET is_active = true WHERE ...;
  UPDATE profiles SET system_paused_campaigns = '[]', guard_paused_at = NULL WHERE ...;
  -- Log resume event
ELSIF v_guard_paused_at IS NOT NULL AND window_expired THEN
  -- Still no money + window expired → clear UI status only, keep campaigns paused
  UPDATE profiles SET system_paused_campaigns = '[]', guard_paused_at = NULL WHERE ...;
END IF;
```

**2. UI: `AutomationConfigTab.tsx`**

- Add balance-aware visibility: if `balance > autoResumeThreshold` and `isSystemPaused`, show a note saying "Balance recovered — status will clear on next transaction"
- The existing `showPausedCampaigns` and locked status already depend on `isSystemPaused`, so once the trigger clears `system_paused_campaigns`, the UI will automatically show "Active"

### Files to Change
1. **Database migration** — Replace `check_auto_resume()` function with balance-first logic
2. **`src/components/AutomationConfigTab.tsx`** — Minor: add a recovery hint when balance is positive but system still shows paused (edge case before trigger fires)

