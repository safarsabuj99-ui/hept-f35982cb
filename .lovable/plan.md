

# Add Complete Messaging Preset Metrics from Meta Ads

## What you'll get
The campaign table will show the **full Meta messaging preset** columns — matching what you see in Meta Ads Manager. Based on the Meta Marketing API's available data, here's what we can implement:

| Column | Source | Status |
|--------|--------|--------|
| Reach | `reach` field in insights | **NEW** |
| Impressions | Already exists | ✓ |
| CPM | Already exists | ✓ |
| Results | Already exists | ✓ |
| Amount Spent | Already exists | ✓ |
| Cost per messaging | Already exists | ✓ |
| Messaging Conversations | Already exists | ✓ |
| New Messaging Contacts | `onsite_conversion.messaging_first_reply` action | **NEW** |
| Messaging Contacts | `onsite_conversion.messaging_first_reply` (same as new contacts) | **NEW** |
| Returning Messaging | Computed: conversations − new contacts | **NEW** |

**Note on 2/3/5 message exchanges:** These are Meta Ads Manager internal metrics that are **not available** through the standard Marketing API `actions` array. Meta does not expose them as action_types. We'll display all the metrics that the API provides.

## Changes

### 1. Database Migration
Add new columns to `daily_metrics`:
```sql
ALTER TABLE public.daily_metrics
  ADD COLUMN reach integer NOT NULL DEFAULT 0,
  ADD COLUMN new_messaging_contacts integer NOT NULL DEFAULT 0;
```

### 2. Sync Engine (`supabase/functions/sync-deep-dive/index.ts`)
- Add `reach` to the Meta insights API `fields` parameter
- Parse `onsite_conversion.messaging_first_reply` from the `actions` array → `new_messaging_contacts`
- Pass both new fields to `upsertMetrics`

### 3. UI — CampaignRow interface (`DeepDiveTable.tsx`)
Add fields: `reach`, `new_messaging_contacts`

### 4. UI — Messages columns in `DeepDiveTable.tsx`
When messaging data exists, show these columns in order:
- **Reach** (show for all objectives)
- Impressions, CPM (existing)
- **Messaging Conversations** (existing)
- **New Messaging Contacts**
- **Returning Messaging** (computed: conversations − new contacts)
- **Cost/Message** (existing)
- Results, Spend, ROAS (existing)

### 5. Aggregation (`CampaignMapping.tsx`)
Sum `reach` and `new_messaging_contacts` from `daily_metrics`.

### Files changed
| File | Change |
|------|--------|
| Migration SQL | Add `reach`, `new_messaging_contacts` columns |
| `sync-deep-dive/index.ts` | Fetch `reach`, parse `messaging_first_reply` |
| `DeepDiveTable.tsx` | Add Reach column (always), expand messaging columns |
| `CampaignMapping.tsx` | Aggregate new fields |

