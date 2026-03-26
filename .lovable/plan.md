## Ad Guard System — Rebuilt ✅

All fixes implemented:

1. **DB Trigger `auto_pause_on_debit`**: Fixed threshold formula to `threshold - overdraft` (was broken when overdraft=0). Merges new campaigns into existing paused list.
2. **DB Trigger `check_auto_resume`**: Resumes when balance > threshold (not 2×). Same formula as pause.
3. **Edge Function `ad-guard-check`**: Full rewrite — Phase 1 syncs guard_paused campaigns to platform APIs, Phase 2 catches stragglers. Service role key auth bypass working.
4. **Edge Function `pause-campaign`**: Already had service role key bypass (fixed in prior iteration).
5. **UI `AutomationConfigTab`**: Fetches from `campaigns` table (not `campaign_mappings`). Shows effective threshold.
