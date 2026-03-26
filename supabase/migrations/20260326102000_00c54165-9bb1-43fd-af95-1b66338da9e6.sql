
CREATE TABLE public.liquid_fund_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.agency_accounts(id),
  amount_bdt numeric NOT NULL,
  type text NOT NULL DEFAULT 'inflow',
  source text NOT NULL DEFAULT 'other',
  date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_by uuid NOT NULL,
  org_id uuid REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.liquid_fund_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_liquid_fund_entries" ON public.liquid_fund_entries
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "manager_finance_read_liquid_fund_entries" ON public.liquid_fund_entries
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'manager') AND has_permission(auth.uid(), 'can_manage_finance'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.liquid_fund_entries;
