

## Fix: Map "Leads (TikTok direct message)" from correct API metric

### Problem
The `leads_tiktok_dm` column is always 0 because the sync function requests `onsite_form` from TikTok's API, which tracks **Instant Form submissions** (a completely different lead capture method). Your campaigns use **TikTok DM-based lead generation**, which uses a different API metric.

### Root Cause
In `supabase/functions/sync-deep-dive/index.ts`:
- Line 666/693: API requests include `onsite_form` in the metrics list
- Line 802: `leads_tiktok_dm` is parsed from `row.metrics?.onsite_form` which always returns 0

### Fix

**File: `supabase/functions/sync-deep-dive/index.ts`**

1. **Replace `onsite_form` with `onsite_on_web_lead` in both API metric requests** (lines 666 and 693)
   - Change the metrics parameter from:
     `'["campaign_name","spend","impressions","clicks","ctr","cpc","conversion","conversion_cost","complete_payment_roas","reach","onsite_form"]'`
   - To:
     `'["campaign_name","spend","impressions","clicks","ctr","cpc","conversion","conversion_cost","complete_payment_roas","reach","onsite_on_web_lead"]'`

2. **Update the parsing logic** (line 802)
   - Change: `const tiktokLeadsDm = parseInt(row.metrics?.onsite_form || "0", 10);`
   - To: `const tiktokLeadsDm = parseInt(row.metrics?.onsite_on_web_lead || "0", 10);`

### Backfill
After deploying, trigger a manual Deep Dive sync from the Sync Health page. Since the sync fetches the full date range from `sync_start_date` to today, all historical data will be re-populated with the correct `leads_tiktok_dm` values on the next run.

### Risk Mitigation
If TikTok's API rejects `onsite_on_web_lead` (error code 40002), the sync will fail gracefully with an error logged. We can then check the edge function logs to identify the correct metric name and adjust. No existing data will be corrupted since the upsert only writes non-zero values.

### Files Changed
- `supabase/functions/sync-deep-dive/index.ts` — 3 line changes (2 metric request strings + 1 parsing line)

