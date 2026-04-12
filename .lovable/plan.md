

## Plan: Advanced SaaS Finance Hub for Platform Owner

### Current State
You have **Revenue** (MRR/ARR analytics), **Billing** (invoices, payment verification, upgrades), and **Plans** as separate pages. Finance is scattered — no unified view, no P&L, no cash flow tracking, no expense management at the SaaS level.

### What We'll Build

A new **Finance Hub** page at `/platform/finance` with 4 tabs, replacing the current separate Revenue page and adding powerful new capabilities:

#### Tab 1: Financial Overview (P&L)
- **KPI row**: Total Revenue (BDT), Total Expenses, Net Profit, Profit Margin %
- **Monthly P&L table**: Revenue vs Expenses vs Net Profit per month (last 12 months)
- **Revenue breakdown chart**: By plan tier (Starter / Growth / Agency Pro)
- Data sources: `organization_subscriptions`, `platform_invoices`, new `platform_expenses` table

#### Tab 2: Revenue Analytics (enhanced current Revenue page)
- MRR/ARR/ARPA/Churn KPIs (existing logic moved here)
- MRR trend chart with waterfall (New, Expansion, Churn)
- Net Revenue Retention (NRR) gauge
- Revenue by plan breakdown
- Churned agency list with lost MRR

#### Tab 3: Expenses
- Track SaaS operating costs: Server/hosting, tools, marketing, salaries, payment gateway fees
- Add/edit/delete expenses with category, date, amount, description
- Monthly expense trend chart
- Category-wise breakdown (pie chart)
- New table: `platform_expenses` (id, category, amount_bdt, description, date, created_by, created_at)

#### Tab 4: Cash Flow
- **Collections timeline**: Money received from agencies (paid invoices + subscription payments)
- **Outflows**: Platform expenses
- **Net cash flow** per month
- **Outstanding receivables**: Unpaid invoices with aging (0-30, 31-60, 60+ days)
- **Upcoming renewals** with expected revenue

### Sidebar Update
- Replace "Revenue" nav item with "Finance" (single entry point)
- Keep Billing and Plans as separate pages (they have operational workflows)

### Database Changes
One new table:
```sql
CREATE TABLE platform_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'other',
  amount_bdt NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: platform_owner only
```

### Files Changed
- `src/pages/PlatformFinanceHub.tsx` — New unified finance page with 4 tabs
- `src/components/PlatformLayout.tsx` — Replace "Revenue" with "Finance" nav item
- `src/App.tsx` — Add route for `/platform/finance`, keep `/platform/revenue` redirecting
- **Migration** — Create `platform_expenses` table with RLS

