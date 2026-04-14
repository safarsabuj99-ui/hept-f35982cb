
-- liquid_fund_loans table
CREATE TABLE public.liquid_fund_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liquid_fund_id uuid REFERENCES public.liquid_fund_entries(id) ON DELETE SET NULL,
  to_account_id uuid NOT NULL REFERENCES public.agency_accounts(id),
  amount_bdt numeric NOT NULL DEFAULT 0,
  returned_bdt numeric NOT NULL DEFAULT 0,
  status public.withdrawal_status NOT NULL DEFAULT 'active',
  lender_name text NOT NULL DEFAULT '',
  date date NOT NULL DEFAULT CURRENT_DATE,
  expected_return_date date,
  note text,
  created_by uuid NOT NULL,
  org_id uuid REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.liquid_fund_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage liquid_fund_loans" ON public.liquid_fund_loans
  FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE TRIGGER trg_set_org_id_liquid_fund_loans
  BEFORE INSERT ON public.liquid_fund_loans
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_user_generic('created_by');

-- liquid_fund_loan_returns table
CREATE TABLE public.liquid_fund_loan_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.liquid_fund_loans(id) ON DELETE CASCADE,
  amount_bdt numeric NOT NULL DEFAULT 0,
  to_account_id uuid NOT NULL REFERENCES public.agency_accounts(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_by uuid NOT NULL,
  org_id uuid REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.liquid_fund_loan_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage liquid_fund_loan_returns" ON public.liquid_fund_loan_returns
  FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE TRIGGER trg_set_org_id_liquid_fund_loan_returns
  BEFORE INSERT ON public.liquid_fund_loan_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_user_generic('created_by');
