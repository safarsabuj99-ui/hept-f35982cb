
CREATE TABLE public.platform_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'other',
  amount_bdt NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owner full access on platform_expenses"
ON public.platform_expenses
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'platform_owner'::app_role))
WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));
