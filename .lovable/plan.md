

## Bug: Expense Not Deducting from Cash Flow After First Entry

### Root Cause

The `agencyAccounts` state in `ExpenseManager.tsx` is fetched **once on mount** (line 70) and **never refreshed**. When you add an expense:

1. **First expense**: Uses the correct balance from the initial fetch (e.g., account has ৳10,000). Updates DB to ৳10,000 - ৳2,000 = ৳8,000. Works correctly.
2. **Second expense**: Still uses the **stale** local state where balance is ৳10,000 (not the updated ৳8,000). Updates DB to ৳10,000 - ৳3,000 = ৳7,000 — **overwriting** the first deduction. The balance should be ৳5,000.

This is a classic stale-state race condition. The same pattern exists in `CashFlowManagement.tsx` for transfers, withdrawals, and fund additions.

### Additional Bug
When deleting an expense, the account balance is **never restored** — the money just disappears.

### Fix Plan

**File: `src/pages/ExpenseManager.tsx`**

1. **Use atomic SQL instead of stale client-side math for balance updates.** Instead of reading `acc.current_balance_bdt` from local state and sending `update({ current_balance_bdt: oldValue - amount })`, use Supabase RPC or a pattern that reads the current DB value. Since we can't easily do `SET balance = balance - X` via the JS SDK, we'll:
   - Fetch the **fresh** account balance from DB right before updating (a single fresh read + write, not from stale state)
   - After successful expense insert + balance update, **refresh `agencyAccounts` state** so subsequent operations use current data

2. **Refresh `agencyAccounts` after every mutation** — extract the account fetch into a reusable function and call it after `handleSubmit` and `handleDelete`.

3. **Restore balance on delete** — when deleting an expense that had a `paid_from_account_id`, add the amount back to that account. This requires fetching the expense's `paid_from_account_id` before deleting.

**File: `src/pages/CashFlowManagement.tsx`**

4. **Same fix for transfers, withdrawals, fund additions, and returns** — all use stale `accounts` state for balance math. After each mutation, `fetchData()` is already called (which refreshes accounts), but the mutation itself uses stale values. Fix each handler to fetch fresh balance from DB before updating.

### Technical Approach

Create a small helper that does an atomic-style balance update:
```typescript
async function adjustAccountBalance(accountId: string, delta: number) {
  const { data } = await supabase
    .from("agency_accounts")
    .select("current_balance_bdt")
    .eq("id", accountId)
    .single();
  if (data) {
    await supabase.from("agency_accounts")
      .update({ current_balance_bdt: Number(data.current_balance_bdt) + delta })
      .eq("id", accountId);
  }
}
```

This reads the **current** DB value each time instead of relying on stale React state.

### Files Changed
- `src/pages/ExpenseManager.tsx` — fix balance deduction, add balance restoration on delete, refresh accounts after mutations
- `src/pages/CashFlowManagement.tsx` — fix all balance update handlers to use fresh DB reads

