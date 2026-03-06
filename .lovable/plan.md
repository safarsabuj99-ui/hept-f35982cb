

# Add Pending Count Badges to Navigation

## What
Show red badge circles with pending counts on the **Payments** and **Orders** nav items in the admin sidebar, so admins immediately see how many items need attention.

## How

### 1. Create a custom hook `usePendingCounts`
**New file: `src/hooks/usePendingCounts.tsx`**
- Query `payment_requests` where `status = 'pending'` → count
- Query `campaign_requests` where `status = 'pending'` → count
- Return `{ pendingPayments: number, pendingOrders: number }`
- Use `@tanstack/react-query` with a reasonable refetch interval (30s) so counts stay fresh

### 2. Update `AdminLayout.tsx`
- Call `usePendingCounts()` in the layout component
- Build a `badgeCounts` map: `{ "/admin/payment-requests": pendingPayments, "/admin/orders": pendingOrders }`
- In both desktop and mobile nav link renders, check if `badgeCounts[item.to] > 0` and render a small red circle badge with the count next to the label

Badge styling: `absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center` (or inline with relative positioning on the nav item).

### Files
| File | Change |
|------|--------|
| `src/hooks/usePendingCounts.tsx` | New hook querying pending counts |
| `src/components/AdminLayout.tsx` | Import hook, render red badges on Payments & Orders nav items |

