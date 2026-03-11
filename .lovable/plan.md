

# Fix TikTok "Enable" Status — Show Active + Toggle

## Problem

The TikTok campaigns in the database have a raw status value `"Enable"` (from before the status mapping was added). The UI's `isActiveStatus()` function only checks for `"active"` or `"active -..."`, so:
- No green dot or "active" label appears — it shows the raw `"Enable"` text
- No toggle switch renders (toggle requires status to be `"active"` or `"paused"`)

Re-running a Deep Dive sync **would** fix this (the mapping logic is now correct), but we should also make the UI and the `pause-campaign` function resilient to legacy raw statuses.

## Fix

### 1. Update `isActiveStatus` in `DeepDiveTable.tsx`

Add `"enable"` to the active status check so raw TikTok statuses are treated as active:

```typescript
const isActiveStatus = (status: string) => {
  const s = status.toLowerCase();
  return s === "active" || s.startsWith("active -") || s === "enable";
};
```

This immediately shows the toggle and green dot for campaigns with `"Enable"` status.

### 2. Normalize display label

In the Delivery column cell, map `"Enable"` → `"Active"` and `"Disable"` → `"Paused"` for display so users see clean labels instead of raw API values:

```typescript
const displayStatus = status.toLowerCase() === "enable" ? "active" 
  : status.toLowerCase() === "disable" ? "paused" 
  : status;
```

### 3. Update `pause-campaign` to handle "Enable" status

The pause-campaign function checks `campaign.status === "paused"` and `campaign.status === "active"` for guard clauses. Add `"enable"` as an alias for active so toggling works on campaigns with legacy status.

### Files Changed

| File | Change |
|------|--------|
| `src/components/client-analytics/DeepDiveTable.tsx` | Add `"enable"` to `isActiveStatus`, normalize display label, apply in both desktop and mobile views |
| `supabase/functions/pause-campaign/index.ts` | Handle `"enable"` as alias for `"active"` in guard clauses |

