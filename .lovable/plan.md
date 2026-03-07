

# Show Linked Integration Name and Proper Account ID

## What Changes

### `src/pages/AdAccounts.tsx`

1. **Build an integration lookup map** from the already-fetched `integrations` array, keyed by `id`, so we can resolve `api_integration_id` on each account.

2. **Add integration name below Platform badge** — In the Platform cell, after the platform badge, show the linked integration's `instance_name` in small muted text. If no integration is linked, show nothing.

3. **Ensure Account ID column shows the raw ad account number** — The `ad_account_id` field already displays in the Account ID column (line 393). This is already correct. If the user wants the column to strip the `act_` prefix or format differently, we keep it as-is since it matches the screenshot.

### Specific Code Changes

**Platform cell (line 386):** Add integration name below the platform badge:
```tsx
<TableCell>
  <Badge variant="secondary" className="capitalize">{a.platform_name}</Badge>
  {integrationMap[a.api_integration_id] && (
    <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[120px]">
      {integrationMap[a.api_integration_id]}
    </p>
  )}
</TableCell>
```

**Integration map** — built from existing `integrations` state (no extra fetch needed):
```tsx
const integrationMap = Object.fromEntries(
  integrations.map(i => [i.id, i.instance_name || `${i.platform} integration`])
);
```

This is a small UI-only change. No database or backend modifications needed.

