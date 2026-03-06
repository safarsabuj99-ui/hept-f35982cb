

# Show Meta Delivery Status in Status Column

## Problem
Currently, the sync function maps Meta's `effective_status` into only two values: "active" or "paused". Meta's API returns richer delivery statuses like `NOT_DELIVERING`, `WITH_ISSUES`, `IN_PROCESS`, `PENDING_REVIEW`, `DISAPPROVED`, `ADSET_PAUSED`, etc. The user wants these real delivery statuses displayed in the Status column.

## Plan

### 1. Update sync to preserve Meta's delivery status as-is
**`supabase/functions/sync-deep-dive/index.ts`**

Instead of collapsing all statuses to "active"/"paused", store the human-readable delivery status directly:
- `ACTIVE` → `"active"`
- `PAUSED` → `"paused"`
- `CAMPAIGN_PAUSED` → `"paused"`
- `NOT_DELIVERING` → `"not delivering"`
- `WITH_ISSUES` → `"with issues"`
- `IN_PROCESS` → `"in process"`
- `PENDING_REVIEW` → `"pending review"`
- `DISAPPROVED` → `"disapproved"`
- `ARCHIVED` → `"archived"`
- `DELETED` → `"deleted"`
- Everything else → lowercase of raw status

### 2. Update DeepDiveTable UI to handle multiple statuses
**`src/components/client-analytics/DeepDiveTable.tsx`**

- Update the status cell to use color-coded dots:
  - Green dot for `"active"`
  - Gray dot for `"paused"`
  - Red dot for `"not delivering"`, `"disapproved"`, `"with issues"`
  - Yellow dot for `"in process"`, `"pending review"`
  - Dim dot for `"archived"`, `"deleted"`
- The pause button remains visible only for `"active"` campaigns (unchanged)

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/sync-deep-dive/index.ts` | Preserve full delivery status from Meta API |
| `src/components/client-analytics/DeepDiveTable.tsx` | Color-code status dots for all delivery statuses |

