

# Fix: "Create Order" Metric Not Showing Data

## Root Cause

The action type `onsite_conversion.messaging_block_create_order` may not be the correct Meta API action type. Meta has several possible action types for order-related events, and the exact string depends on how the advertiser's pixel/events are configured. The data is likely coming through under a different action type name.

## Fix

**Add debug logging** to the sync function to capture all action types returned by Meta, so we can identify the exact action type string for "Create Order." Then update the parser to match the correct one.

Additionally, Meta may use multiple possible action types for order creation:
- `onsite_conversion.messaging_block_create_order`
- `offsite_conversion.fb_pixel_custom` (custom event)
- `app_custom_event.fb_mobile_order_created`
- `onsite_conversion.lead_grouped` with sub-types

### Changes to `supabase/functions/sync-deep-dive/index.ts`

1. **Add action-type logging** — For the first few rows of each Meta account, log ALL action types found in the `actions[]` array. This will reveal the exact string Meta uses for "Create Order."

2. **Broaden the matching** — Match multiple possible action type patterns that could represent order creation:
   - Keep `onsite_conversion.messaging_block_create_order`  
   - Add `offsite_conversion.fb_pixel_lead` (sometimes used for orders)
   - Add any action type containing `create_order` as a substring match

### Implementation

```typescript
// In the actions parsing loop, add logging for first row per account:
if (rowIndex === 0) {
  const allTypes = row.actions?.map((a: any) => `${a.action_type}=${a.value}`) || [];
  console.log(`Meta actions for ${campaignName}: ${allTypes.join(', ')}`);
}

// Broaden create_order matching:
if (at === "onsite_conversion.messaging_block_create_order" 
    || at.includes("create_order")) {
  createOrder += val;
}
```

After deploying, run one sync and check the edge function logs. The logged action types will reveal the exact Meta action type name. We can then update the parser to match precisely.

| File | Change |
|------|--------|
| `sync-deep-dive/index.ts` | Add action type debug logging + broaden create_order matching |

No database changes needed — the `create_order` column already exists.

