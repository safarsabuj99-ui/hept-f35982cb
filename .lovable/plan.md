

## Three Fixes: Date Filter on Payments Page + Impersonation Balance Bug + Wallet Date Filter Bug

### 1. Add Date Filter to Payments & Deposits page

**File: `src/pages/PaymentRequests.tsx`**

- Import `DateRangeFilter` and its types
- Add date range state (default "all_time" since this is an admin page showing history)
- Filter `requests` and `deposits` by date before rendering
- For payment requests: filter by `payment_date` field (falling back to `created_at`)
- For deposits: filter by `date` field
- Place the filter bar between the page header and the Tabs

### 2. Fix balance not showing during admin impersonation

**Root cause:** In `useImpersonation`, `effectiveClientId` depends on `role === "admin"`. But `role` loads asynchronously from the database. On first render, `role` is `null`, so `isImpersonating` is `false` and `effectiveClientId` becomes the admin's own user ID. Data fetches run with the wrong ID and return empty results. When `role` finally resolves, `effectiveClientId` updates but `loading` is already `false`.

**Fix in `src/hooks/useImpersonation.tsx`:**
- Don't depend on `role` to determine impersonation. If `sessionStorage` has `impersonate_client_id`, use it directly regardless of role state. The `ProtectedRoute` already validates admin access.

```typescript
// Current (broken):
const isImpersonating = role === "admin" && !!impersonatingClientId;

// Fixed:
const isImpersonating = !!impersonatingClientId;
```

This way `effectiveClientId` is correct from the very first render, before `role` even loads.

### 3. Fix wallet date filter not matching transactions/payment requests

**Root cause in `src/pages/ClientWallet.tsx`:** The `filterByDate` function compares `Date` objects. But:
- `dateRange.from/to` use Dhaka timezone midnight (`new Date("2026-03-26T00:00:00")` = local midnight)
- Transaction `date` is a plain date string — `new Date("2026-03-26")` parses as UTC midnight, creating timezone mismatch
- Payment request `created_at` is a full ISO timestamp, comparing against midnight boundaries fails

**Fix:** Use the same string-comparison approach already used in `ClientDashboard.tsx`:
```typescript
const filterByDate = useCallback((items: any[], dateField: string) => {
  if (!dateRange) return items;
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");
  return items.filter((item) => {
    const d = item[dateField]?.substring(0, 10);
    return d >= fromStr && d <= toStr;
  });
}, [dateRange]);
```

Also filter payment requests by `payment_date` (the actual payment date) instead of `created_at`, falling back to `created_at` date:
```typescript
const filteredPaymentRequests = useMemo(() => {
  if (!dateRange) return paymentRequests;
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");
  return paymentRequests.filter((pr: any) => {
    const d = (pr.payment_date || pr.created_at)?.substring(0, 10);
    return d >= fromStr && d <= toStr;
  });
}, [paymentRequests, dateRange]);
```

### Files Changed
- `src/pages/PaymentRequests.tsx` — add date filter
- `src/hooks/useImpersonation.tsx` — fix line 34
- `src/pages/ClientWallet.tsx` — fix `filterByDate` to use string comparison

