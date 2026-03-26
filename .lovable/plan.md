

## Fix: Map "Leads (TikTok direct message)" from correct API metric

### Problem
The `leads_tiktok_dm` column is always 0 because the sync function was parsing from `onsite_form` (Instant Form submissions), which is a different lead capture method than TikTok DM-based lead generation.

### Investigation
- First attempted `onsite_on_web_lead` — TikTok API rejected it with error 40002 (invalid metric field).
- Research confirmed that TikTok's reporting API does not expose a dedicated "Leads (TikTok direct message)" metric.
- For DM-optimized lead generation campaigns, TikTok counts DM leads under the general `conversion` metric.

### Fix Applied

**File: `supabase/functions/sync-deep-dive/index.ts`**

1. **Reverted** `onsite_on_web_lead` back to `onsite_form` in both API metric requests (lines 666, 693) to stop the 40002 API error.
2. **Mapped** `leads_tiktok_dm` from `conversion` (line 802) — for DM-optimized lead gen campaigns, the `conversion` metric IS the DM lead count.

### Backfill
Trigger a manual Deep Dive sync from the Sync Health page. Historical data will be re-populated with correct `leads_tiktok_dm` values.

### Files Changed
- `supabase/functions/sync-deep-dive/index.ts` — 3 line changes
