

# Rename "Daily Spending Limit" → "Account Spending Limit"

## What Changes

The user wants the spending limit field to represent the **account-level spending limit** (as set on the ads platform), not a daily limit. The admin should be able to set this value without going to the ads platform.

### 1. Database Migration
Rename column `daily_spending_limit` → `account_spending_limit` in `ad_accounts` table.

```sql
ALTER TABLE ad_accounts RENAME COLUMN daily_spending_limit TO account_spending_limit;
```

### 2. Code Updates (3 files)

**`src/pages/AdAccounts.tsx`**
- Rename form field `daily_spending_limit` → `account_spending_limit`
- Update label from "Daily Spending Limit ($)" → "Account Spending Limit ($)"
- Update table header and cell references

**`src/pages/AdAccountDetail.tsx`**
- Rename state variable `dailyLimit` references to use `account_spending_limit`
- Update label text

**`src/components/dashboard/SystemHealthWidget.tsx`**
- Update interface and all references from `daily_spending_limit` → `account_spending_limit`
- Update display text accordingly

All changes are straightforward renames — no logic changes needed.

