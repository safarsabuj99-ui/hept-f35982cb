

# Add Instance Name Filter to Ad Accounts Search

## What to do
Extend the existing search filter on the Ad Accounts page to also match against the **instance name** from the linked API integration.

## Changes

### `src/pages/AdAccounts.tsx`
1. In the `filteredAccounts` filter function (~line 185), look up the integration's `instance_name` via `a.api_integration_id` from the already-loaded `integrations` state, and include it in the search match.
2. Update the search placeholder text to mention "instance name".

Specifically, the filter block changes from:
```ts
return (a.account_name || "").toLowerCase().includes(q)
  || (a.ad_account_id || "").toLowerCase().includes(q)
  || (a.platform_name || "").toLowerCase().includes(q);
```
To:
```ts
const integration = integrations.find(i => i.id === a.api_integration_id);
const instanceName = (integration?.instance_name || "").toLowerCase();
return (a.account_name || "").toLowerCase().includes(q)
  || (a.ad_account_id || "").toLowerCase().includes(q)
  || (a.platform_name || "").toLowerCase().includes(q)
  || instanceName.includes(q);
```

No database changes needed — integration data is already fetched.

