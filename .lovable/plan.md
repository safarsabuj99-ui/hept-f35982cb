

# Objective-Specific Column Sets for Meta Campaigns

## Problem
Currently the campaign table shows the same generic columns (Impressions, CPM, Results, Cost/Result, Spend, ROAS) for all campaigns regardless of objective. Meta campaigns have different objectives (Sales, Messages, Traffic, etc.) that need different funnel metrics.

## Approach

This requires changes across 3 layers: database schema, sync engine, and UI.

### 1. Database Migration

**Add `objective` column to `campaigns` table:**
```sql
ALTER TABLE public.campaigns ADD COLUMN objective text DEFAULT '' NOT NULL;
```

**Add funnel action columns to `daily_metrics` table:**
```sql
ALTER TABLE public.daily_metrics
  ADD COLUMN view_content integer NOT NULL DEFAULT 0,
  ADD COLUMN add_to_cart integer NOT NULL DEFAULT 0,
  ADD COLUMN initiate_checkout integer NOT NULL DEFAULT 0,
  ADD COLUMN purchase integer NOT NULL DEFAULT 0,
  ADD COLUMN messaging_conversations integer NOT NULL DEFAULT 0,
  ADD COLUMN cost_per_purchase numeric NOT NULL DEFAULT 0,
  ADD COLUMN cost_per_message numeric NOT NULL DEFAULT 0,
  ADD COLUMN cpm numeric NOT NULL DEFAULT 0;
```

### 2. Sync Engine (`supabase/functions/sync-deep-dive/index.ts`)

**Fetch campaign objectives from Meta API** — extend the existing status fetch call:
```
/campaigns?fields=id,effective_status,objective
```
Build an `objectiveMap` alongside `metaStatusMap`. Meta objectives: `OUTCOME_SALES`, `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_TRAFFIC`, `MESSAGES`, etc.

**Extract granular actions from the existing `actions` array** — the API already returns these, we just don't parse them:
- `offsite_conversion.fb_pixel_view_content` → `view_content`
- `offsite_conversion.fb_pixel_add_to_cart` → `add_to_cart`
- `offsite_conversion.fb_pixel_initiate_checkout` → `initiate_checkout`
- `offsite_conversion.fb_pixel_purchase` → `purchase`
- `onsite_conversion.messaging_conversation_started_7d` → `messaging_conversations`

**Pass objective to `upsertCampaign`**, store in campaigns table.

**Pass new metric fields to `upsertMetrics`**, store in daily_metrics.

### 3. UI Changes

**Update `CampaignRow` interface** — add new optional fields:
```typescript
objective?: string;
view_content?: number;
add_to_cart?: number;
initiate_checkout?: number;
purchase?: number;
messaging_conversations?: number;
```

**Update data aggregation** in `CampaignMapping.tsx` and any page that builds `CampaignRow[]` — aggregate the new fields from `daily_metrics` and pass `objective` from `campaigns`.

**Update `DeepDiveTable`** — detect campaign objective and show appropriate column set:

| Sales Objective | Messages Objective | Other/Generic |
|---|---|---|
| Impressions | Impressions | Impressions |
| CPM | CPM | CPM |
| View Content | Messages | Results |
| Add to Cart | Cost/Message | Cost/Result |
| Initiate Checkout | Spend | Spend |
| Purchase | ROAS | ROAS |
| Cost/Purchase | | |
| Spend | | |
| ROAS | | |

Since a single table view may contain mixed objectives, we'll show **all relevant columns** and display "—" for metrics that don't apply to a given campaign's objective. The table will auto-detect which objective columns have data and show them.

### 4. Files Changed

| File | Change |
|------|--------|
| Migration SQL | Add `objective` to campaigns, add action columns to daily_metrics |
| `supabase/functions/sync-deep-dive/index.ts` | Fetch objective, extract granular actions, pass to upsert |
| `src/components/client-analytics/DeepDiveTable.tsx` | Add objective-aware columns, update mobile card |
| `src/pages/CampaignMapping.tsx` | Aggregate new fields from daily_metrics |
| `src/pages/ClientDashboard.tsx` | Pass new fields if campaigns shown there |

### 5. Meta Action Type Mapping (exact API values)

```text
Meta actions[] array → DB columns:
─────────────────────────────────────
action_type: "offsite_conversion.fb_pixel_view_content" → view_content
action_type: "offsite_conversion.fb_pixel_add_to_cart"  → add_to_cart  
action_type: "offsite_conversion.fb_pixel_initiate_checkout" → initiate_checkout
action_type: "offsite_conversion.fb_pixel_purchase"     → purchase
action_type: "onsite_conversion.messaging_conversation_started_7d" → messaging_conversations

Meta campaign objective → stored as:
─────────────────────────────────────
OUTCOME_SALES        → "sales"
MESSAGES             → "messages"  
OUTCOME_TRAFFIC      → "traffic"
OUTCOME_LEADS        → "leads"
OUTCOME_ENGAGEMENT   → "engagement"
OUTCOME_AWARENESS    → "awareness"
```

