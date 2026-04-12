
-- Platform accounts for SaaS-level cash management
CREATE TABLE public.platform_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Bank',
  account_number TEXT,
  current_balance_bdt NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_all_platform_accounts"
  ON public.platform_accounts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));

-- Platform fund transfers
CREATE TABLE public.platform_fund_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id UUID NOT NULL REFERENCES public.platform_accounts(id),
  to_account_id UUID NOT NULL REFERENCES public.platform_accounts(id),
  amount_bdt NUMERIC NOT NULL,
  note TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_fund_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_all_platform_fund_transfers"
  ON public.platform_fund_transfers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));

-- Add paid_from_account_id to platform_expenses
ALTER TABLE public.platform_expenses
  ADD COLUMN paid_from_account_id UUID REFERENCES public.platform_accounts(id);
