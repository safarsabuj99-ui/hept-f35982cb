

## Add Manual USD Spend Tracking

**Problem:** Currently, the USD inventory only tracks ad spend (from `daily_metrics`). When you spend USD on subscriptions, tools, or other non-ad expenses, there's no way to record it — so the inventory balance doesn't reflect your actual USD on hand.

**Solution:** Create a `usd_manual_spends` table and add a "Spend USD" button alongside the existing "Buy USD" button on the Wallet Inventory page. The auto-snapshot edge function will subtract these manual spends from the balance.

### Changes

#### 1. New database table: `usd_manual_spends`

```sql
CREATE TABLE public.usd_manual_spends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  amount_usd numeric NOT NULL,
  category text NOT NULL DEFAULT 'other',
  description text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid
);

ALTER TABLE public.usd_manual_spends ENABLE ROW LEVEL SECURITY;
-- RLS: admin-only access
CREATE POLICY "Admins can manage manual spends"
  ON public.usd_manual_spends FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.usd_manual_spends;
```

#### 2. Update `auto-snapshot-usd` edge function

Add a third data source to the balance calculation:

```
balance = SUM(usd_purchases.usd_received) - SUM(daily_metrics.spend) - SUM(usd_manual_spends.amount_usd)
```

Also include `manual_spend` total in the `metrics` JSONB for the UI to display.

#### 3. Update `src/pages/WalletInventory.tsx`

- **New "Spend USD" button** next to "Buy USD" — opens a dialog with fields: Date, USD Amount, Category (dropdown: Subscription, Tools, Hosting, Transfer, Other), Description, Notes.
- **New state and fetch** for manual spends list, displayed in a second table tab or section below purchases ("Manual Spends" history).
- **Inventory overview** — add a new metric row showing "Manual Spends" total alongside existing "Spent (Since)" which only covers ad spend. The "Available USD" will automatically reflect the correct balance from the snapshot.
- **Realtime subscription** — listen to `usd_manual_spends` changes.
- Mobile card view and desktop table view for the manual spends history, matching existing purchase history styling.

#### 4. Spend categories

Predefined categories: `Subscription`, `Tools/Software`, `Hosting`, `Domain`, `Transfer`, `Refund`, `Other` — stored as plain text for flexibility.

### Files changed
- Database migration (new `usd_manual_spends` table + RLS + realtime)
- `supabase/functions/auto-snapshot-usd/index.ts` — include manual spends in balance
- `src/pages/WalletInventory.tsx` — add Spend USD dialog, manual spend history, updated overview metrics

