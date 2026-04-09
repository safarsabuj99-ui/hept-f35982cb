

## Fix: TikTok "Conversations (TikTok DM)" Not Showing Real Data

### Root Cause

In `supabase/functions/sync-deep-dive/index.ts`, the TikTok API request only fetches generic metrics and does **not** request the actual conversation-specific metrics from TikTok's Reporting API.

**Current (broken)** — lines 829-830:
```typescript
const tiktokConvDm = conversions; // Use optimization conversion as messaging proxy
const tiktokLeadsDm = conversions; // For DM-optimized lead gen campaigns
```

Both `conversations_tiktok_dm` and `leads_tiktok_dm` are just copies of the generic `conversion` count. The TikTok-specific metric `onsite_on_web_detail` (which maps to "Conversations - TikTok direct message" shown in TikTok Ads Manager) is never requested from the API.

### Fix

**File: `supabase/functions/sync-deep-dive/index.ts`**

1. **Add real TikTok messaging metrics to API request** (lines 694 and 721):
   - Add `"onsite_on_web_detail"` to the metrics array (this is the TikTok API field for "Conversations - TikTok direct message")
   - Add `"ix_page_viewcontent_count_by_page"` for instant messaging conversations if available

2. **Parse the actual metric values** (lines 829-830):
   - `conversations_tiktok_dm` = parsed from `row.metrics.onsite_on_web_detail` (real DM conversations)
   - `leads_tiktok_dm` = `conversion` only when `onsite_on_web_detail > 0` (filtered attribution per existing design)
   - Fall back to `conversion` if the new metric field is missing (backward safety)

3. **Redeploy** the `sync-deep-dive` edge function

### What This Fixes

| Before | After |
|---|---|
| Conv. (TikTok DM) = generic conversion count (wrong) | Conv. (TikTok DM) = actual `onsite_on_web_detail` value from TikTok API |
| Leads = same as conversions (inflated) | Leads = conversions only when DM conversations exist |
| Data doesn't match TikTok Ads Manager screenshot | Data matches TikTok Ads Manager |

### Files Modified

| File | Change |
|---|---|
| `supabase/functions/sync-deep-dive/index.ts` | Add `onsite_on_web_detail` to API metrics list, parse real values |

One file change + redeploy. No migration needed — the `conversations_tiktok_dm` column already exists.

