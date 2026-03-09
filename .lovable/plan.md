

# Plan: Total Balance Widget — Only Positive Balances

## Problem
Line 232 sums all client balances (positive and negative). The widget should only sum clients with positive balances.

## Change

**File: `src/pages/AdminDashboard.tsx`**

**Line 232** — Change from:
```ts
const totalBalance = clients.reduce((s, c) => s + c.balance, 0);
```
To:
```ts
const totalBalance = clients.filter(c => c.balance > 0).reduce((s, c) => s + c.balance, 0);
```

**Line 328** — Update the subtitle to show count of positive-balance clients instead of all clients:
```ts
subtitle={`${clients.filter(c => c.balance > 0).length} clients`}
```

This ensures the Total Balance widget only sums and counts clients whose balance is positive, excluding any client with zero or negative balance.

