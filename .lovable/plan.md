## Goal

Fix the Owner Draw expense dated **2026-05-01** so the amount reads **৳2,100** instead of **৳21,000**.

## What I confirmed

- Located the row in `agency_expenses`:
  - `id`: `b6c421b1-b4c6-47cf-837a-8a5b52dc9098`
  - `date`: 2026-05-01, `category`: Owner_Draw, `description`: Personal
  - `amount_bdt`: 21000
- The `paid_from_account_id` on this row points to `6f8357b5-a128-4319-bef8-7be5f647d456`, which **does not exist** in `platform_accounts`. So no platform/cash account balance is currently affected by this expense, and no balance refund is required.

## Change

Run a one-line migration to update just this row:

```sql
UPDATE public.agency_expenses
SET amount_bdt = 2100
WHERE id = 'b6c421b1-b4c6-47cf-837a-8a5b52dc9098';
```

No other tables, P&L formulas, or balances need touching — the Finance → Expenses tab will recompute totals from this row automatically.

## Verification after apply

- Re-open `/admin/finance?tab=expenses` and confirm the Owner Draw row now shows **৳2,100**.
- Check Cash Flow / OpEx totals reflect the ৳18,900 reduction.
