
-- Enums
CREATE TYPE withdrawal_status AS ENUM ('active', 'partially_returned', 'fully_returned');
CREATE TYPE withdrawal_category AS ENUM ('personal_loan', 'business_loan', 'others_loan', 'advance', 'other');

-- Withdrawals table
CREATE TABLE public.cash_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id UUID NOT NULL REFERENCES public.agency_accounts(id) ON DELETE RESTRICT,
  amount_bdt NUMERIC NOT NULL,
  returned_bdt NUMERIC NOT NULL DEFAULT 0,
  category withdrawal_category NOT NULL,
  status withdrawal_status NOT NULL DEFAULT 'active',
  borrower_name TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_return_date DATE,
  note TEXT,
  created_by UUID NOT NULL,
  org_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_cash_withdrawals" ON public.cash_withdrawals
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "manager_finance_read_cash_withdrawals" ON public.cash_withdrawals
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role) AND has_permission(auth.uid(), 'can_manage_finance'::text));

CREATE TRIGGER set_updated_at_cash_withdrawals
  BEFORE UPDATE ON public.cash_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Returns table
CREATE TABLE public.cash_withdrawal_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id UUID NOT NULL REFERENCES public.cash_withdrawals(id) ON DELETE CASCADE,
  amount_bdt NUMERIC NOT NULL,
  to_account_id UUID NOT NULL REFERENCES public.agency_accounts(id) ON DELETE RESTRICT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_by UUID NOT NULL,
  org_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_withdrawal_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_cash_withdrawal_returns" ON public.cash_withdrawal_returns
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "manager_finance_read_cash_withdrawal_returns" ON public.cash_withdrawal_returns
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role) AND has_permission(auth.uid(), 'can_manage_finance'::text));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_withdrawals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_withdrawal_returns;
