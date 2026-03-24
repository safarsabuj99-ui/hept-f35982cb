

## Plan: Fix Invalid TikTok Metric Error in sync-deep-dive

### Problem
The TikTok API rejects `onsite_on_site_conversation_msg_count` as an invalid metric field (error code 40002), causing the entire TikTok deep-dive sync to fail and return no data.

### Root Cause
`onsite_on_site_conversation_msg_count` is not a valid TikTok Reporting API v1.3 metric. The TikTok API documentation does not list this field. Messaging conversation metrics are not available as standalone reporting fields in the integrated report endpoint.

### Solution: Two-Phase Fetch with Graceful Fallback

Instead of cramming all metrics (including potentially unsupported ones) into a single request, implement a **safe core request + optional extended request** pattern:

**Phase 1 — Core metrics request (always succeeds):**
Remove `onsite_on_site_conversation_msg_count` from the metrics list. Keep only validated metrics:
```
campaign_name, spend, impressions, clicks, ctr, cpc, conversion, 
conversion_cost, complete_payment_roas, reach, onsite_form
```

**Phase 2 — Optional messaging metrics request (try/catch, no-fail):**
Attempt a second lightweight request with messaging-specific metrics. If TikTok supports them for the account, merge the data. If it fails, gracefully default to 0 and log a warning — never block the sync.

The candidate messaging metrics to try:
- `onsite_initiate_checkout_count` or similar onsite conversation fields
- Since the official API docs don't expose a direct "DM conversation count" metric, map the `conversion` field (which already represents the optimization event result) as the messaging proxy when the campaign objective is messaging.

### Implementation

**File: `supabase/functions/sync-deep-dive/index.ts`**

1. Remove `onsite_on_site_conversation_msg_count` from both BC and direct metrics strings (lines 666 and 693)
2. Replace with only validated metrics: `campaign_name,spend,impressions,clicks,ctr,cpc,conversion,conversion_cost,complete_payment_roas,reach,onsite_form`
3. Use `conversion` (the campaign's optimization event result) to populate `conversations_tiktok_dm` — this naturally maps to messaging conversations when the campaign objective is messaging/lead gen
4. Keep `onsite_form` for `leads_tiktok_dm` (Instant Form leads — this is a valid metric)
5. Update the data mapping section (line 801) to use `conversion` instead of the invalid metric

### Technical Detail

```text
BEFORE (broken):
  metrics: [..., "onsite_on_site_conversation_msg_count", "onsite_form"]
  → API returns error 40002, entire sync fails

AFTER (fixed):
  metrics: [..., "reach", "onsite_form"]
  → conversations_tiktok_dm = row.metrics.conversion (optimization result)
  → leads_tiktok_dm = row.metrics.onsite_form (valid metric)
  → API succeeds, data flows correctly
```

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/sync-deep-dive/index.ts` | Remove invalid metric, use `conversion` for DM conversations, keep `onsite_form` for leads |

