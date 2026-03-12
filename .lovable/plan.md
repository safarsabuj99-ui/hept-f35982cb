

# Fix Create Order + Per-Platform Default Presets + Drag-and-Drop Columns

## 1. Fix: Create Order Metric Not Showing Data

**Root cause found.** Looking at the edge function logs, the actual Meta action type is `onsite_conversion.messaging_order_created_v2` -- NOT `onsite_conversion.messaging_block_create_order`. The current code's substring match `at.includes("create_order")` also misses it because the string contains `order_created`, not `create_order`.

Example from logs:
```
onsite_conversion.messaging_order_created_v2=3
```

**Fix in `sync-deep-dive/index.ts`:** Update the matching condition:
```typescript
if (at === "onsite_conversion.messaging_order_created_v2" 
    || at === "onsite_conversion.messaging_block_create_order" 
    || at.includes("create_order") 
    || at.includes("order_created")) {
  createOrder += val;
}
```

After fix, a re-sync will populate the `create_order` column with data.

## 2. Per-Platform Default Presets (Saved to Account)

Store preset preferences in the `profiles.permissions` JSONB field (already exists, already a flexible JSON column) under a `campaign_presets` key:
```json
{
  "campaign_presets": {
    "all": "messages",
    "meta": "messages", 
    "tiktok": "performance",
    "google": "sales"
  }
}
```

No database migration needed -- `permissions` JSONB column already exists on `profiles`.

**Changes:**
- **`DeepDiveTable.tsx`**: Accept new prop `defaultPreset` and use it as initial value for `selectedPreset` state
- **`DeepDiveTable.tsx`**: Add a "Set as Default" button/icon next to the preset selector that saves the current preset for the active platform tab
- **`CampaignAnalyticsPanel.tsx`**: Load preset preferences from profile, pass `defaultPreset` to each platform's `DeepDiveTable` instance
- **`CampaignMapping.tsx`**: Load user's preset preferences and pass them through to `CampaignAnalyticsPanel`

## 3. Drag-and-Drop Column Reordering

Use `@tanstack/react-table`'s built-in `columnOrder` state combined with native HTML drag events on table headers (no extra library needed).

**Changes in `DeepDiveTable.tsx`:**
- Add `columnOrder` state to `useReactTable` config
- Add `draggable`, `onDragStart`, `onDragOver`, `onDrop` handlers to `<TableHead>` elements
- Visual feedback: highlight drop target with a left/right border indicator
- Persist column order per-platform in profile `permissions.column_order` JSONB (same approach as presets)

## Files Changed

| File | Change |
|------|--------|
| `sync-deep-dive/index.ts` | Fix action type matching to include `order_created` |
| `DeepDiveTable.tsx` | Add defaultPreset prop, "Set Default" button, drag-and-drop column reorder |
| `CampaignAnalyticsPanel.tsx` | Load/pass preset preferences per platform tab |
| `CampaignMapping.tsx` | Fetch user profile preferences, pass to analytics panel |

No database migration needed.

