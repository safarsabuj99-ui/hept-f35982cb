

## Liquid Fund Inflows — Track External Business Income in Cash Flow

### What This Solves
You sometimes receive BDT payments from outside sources (freelance work, consulting, other business income) that aren't client deposits. Currently there's no way to record these inflows into your agency accounts. This feature adds a "Deposit / Liquid Fund" action that credits an agency account and tracks the history.

### Design

**New DB table: `liquid_fund_entries`**
Records external money coming into (or going out of) agency accounts — separate from client payments and USD purchases.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| account_id | uuid | Which agency account receives the funds |
| amount_bdt | numeric | Amount deposited |
| type | text | `inflow` or `withdrawal` (future-proof) |
| source | text | e.g. "Freelance project", "Personal loan", "Other business" |
| date | date | When it happened |
| note | text | Optional details |
| created_by | uuid | |
| org_id | uuid | |
| created_at | timestamptz | |

RLS: Admin-only (matches `agency_accounts` pattern).

### UI Changes — `CashFlowManagement.tsx`

1. **New "Add Fund" button** next to Transfer and Add Account buttons — opens a dialog with:
   - Account selector (which account to deposit into)
   - Amount (BDT)
   - Source dropdown: Personal Fund, Other Business, Freelance, Loan, Other (with free-text for "Other")
   - Date field
   - Note (optional)

2. **On submit**: Insert into `liquid_fund_entries` + update `agency_accounts.current_balance_bdt` (same pattern as transfers)

3. **Recent Activity feed**: Include liquid fund entries as green "in" items with description like "Liquid Fund: Freelance project"

4. **Realtime**: Subscribe to `liquid_fund_entries` table changes

### Files Changed
- **Migration**: Create `liquid_fund_entries` table with RLS
- **`src/pages/CashFlowManagement.tsx`**: Add deposit dialog, fetch liquid fund entries in activity feed, realtime subscription

### Technical Detail

```sql
CREATE TABLE public.liquid_fund_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  amount_bdt numeric NOT NULL,
  type text NOT NULL DEFAULT 'inflow',
  source text NOT NULL DEFAULT 'other',
  date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_by uuid NOT NULL,
  org_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.liquid_fund_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_liquid_fund_entries" ON public.liquid_fund_entries
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) 
  WITH CHECK (has_role(auth.uid(), 'admin'));
```

The deposit handler will:
1. Insert into `liquid_fund_entries`
2. Update `agency_accounts.current_balance_bdt` += amount
3. Show success toast and refresh data

