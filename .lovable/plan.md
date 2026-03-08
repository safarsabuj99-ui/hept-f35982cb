

# Sort Active Accounts First & Add Search Filter

## Changes in `src/pages/AdAccounts.tsx`

### 1. Add search state
Add a `searchQuery` state variable for filtering.

### 2. Sort accounts: active first
After fetching, sort the accounts so `is_active === true` accounts appear first, then by `created_at` descending within each group. This replaces the current `order("created_at", { ascending: false })` sort with a client-side sort:
```ts
const sorted = (accs ?? []).sort((a, b) => {
  if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
});
```

### 3. Add search input above the table
Place a search `Input` with a search icon between the header buttons and the `Card`, filtering accounts by `account_name`, `ad_account_id`, or `platform_name` (case-insensitive).

### 4. Apply filter before pagination
```ts
const filteredAccounts = accounts.filter(a => {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return (a.account_name || "").toLowerCase().includes(q)
    || (a.ad_account_id || "").toLowerCase().includes(q)
    || (a.platform_name || "").toLowerCase().includes(q);
});
```
Use `filteredAccounts` instead of `accounts` for pagination slice and total count. Reset `currentPage` to 1 when search changes.

### File: `src/pages/AdAccounts.tsx` only

