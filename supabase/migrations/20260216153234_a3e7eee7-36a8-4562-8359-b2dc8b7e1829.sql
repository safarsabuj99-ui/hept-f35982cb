
-- Enum for agency account types
CREATE TYPE public.agency_account_type AS ENUM ('Cash', 'Bank', 'MFS');

-- Agency fund accounts
CREATE TABLE public.agency_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type agency_account_type NOT NULL,
  account_number TEXT,
  current_balance_bdt NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agency_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_agency_accounts" ON public.agency_accounts
  FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "manager_finance_read_agency_accounts" ON public.agency_accounts
  FOR SELECT USING (has_role(auth.uid(), 'manager') AND has_permission(auth.uid(), 'can_manage_finance'));

-- Transfer history
CREATE TABLE public.fund_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_account_id UUID NOT NULL REFERENCES public.agency_accounts(id),
  to_account_id UUID NOT NULL REFERENCES public.agency_accounts(id),
  amount_bdt NUMERIC NOT NULL,
  note TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fund_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_fund_transfers" ON public.fund_transfers
  FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "manager_finance_read_fund_transfers" ON public.fund_transfers
  FOR SELECT USING (has_role(auth.uid(), 'manager') AND has_permission(auth.uid(), 'can_manage_finance'));

-- Add agency_account_id to track which account received/paid for existing tables
ALTER TABLE public.payment_requests ADD COLUMN received_in_account_id UUID REFERENCES public.agency_accounts(id);
ALTER TABLE public.usd_purchases ADD COLUMN paid_from_account_id UUID REFERENCES public.agency_accounts(id);
ALTER TABLE public.agency_expenses ADD COLUMN paid_from_account_id UUID REFERENCES public.agency_accounts(id);
