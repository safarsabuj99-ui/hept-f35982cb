

# Add "Create Order" Metric + Preset Selector for Campaign Table

## Changes

### 1. Database Migration
Add `create_order` column to `daily_metrics`:
```sql
ALTER TABLE public.daily_metrics ADD COLUMN create_order integer NOT NULL DEFAULT 0;
```

### 2. Sync Engine (`supabase/functions/sync-deep-dive/index.ts`)
- Parse `onsite_conversion.messaging_block_create_order` from Meta `actions[]` array → `create_order`
- Pass to `upsertMetrics`

### 3. Preset Selector UI (`DeepDiveTable.tsx`)
Add a **Preset dropdown** next to the existing Status filter with these options:
- **Auto** (default) — current behavior, auto-detects which columns to show based on data
- **Sales** — shows: Reach, Impressions, CPM, View Content, Add to Cart, Checkout, Purchase, Cost/Purchase, Spend, ROAS
- **Messages** — shows: Reach, Impressions, CPM, Messages, New Contacts, Returning, Create Order, Cost/Message, Spend, ROAS
- **Performance** — shows: Reach, Impressions, CPM, Clicks, CTR, CPC, Results, Cost/Result, Spend, ROAS

When a preset is selected, the table **forces** that column set regardless of data detection. When "Auto" is selected, it uses the existing `hasObjectiveData` logic.

### 4. CampaignRow Interface Updates
Add `create_order?: number` field.

### 5. Aggregation (`CampaignMapping.tsx`)
Sum `create_order` from `daily_metrics`.

### 6. Mobile Card View
Add "Create Order" row for messaging campaigns.

### Files Changed
| File | Change |
|------|--------|
| Migration SQL | Add `create_order` column |
| `sync-deep-dive/index.ts` | Parse `messaging_block_create_order` action |
| `DeepDiveTable.tsx` | Add preset selector, create_order column, refactor column logic |
| `CampaignMapping.tsx` | Aggregate `create_order` field |

