
CREATE TABLE public.usd_manual_spends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  amount_usd numeric NOT NULL,
  category text NOT NULL DEFAULT 'other',
  description text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid REFERENCES public.organizations(id)
);

ALTER TABLE public.usd_manual_spends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage manual spends"
  ON public.usd_manual_spends FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.usd_manual_spends;
