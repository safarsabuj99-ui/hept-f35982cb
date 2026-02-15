
-- USD Inventory / Purchases table
CREATE TABLE public.usd_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  bdt_amount_paid NUMERIC NOT NULL,
  usd_received NUMERIC NOT NULL,
  calculated_rate NUMERIC GENERATED ALWAYS AS (CASE WHEN usd_received > 0 THEN ROUND(bdt_amount_paid / usd_received, 2) ELSE 0 END) STORED,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.usd_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_usd_purchases" ON public.usd_purchases FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Agency Expenses table
CREATE TYPE public.expense_category AS ENUM ('Rent', 'Salary', 'Software', 'Owner_Draw', 'Marketing', 'Other');

CREATE TABLE public.agency_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_bdt NUMERIC NOT NULL,
  category public.expense_category NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agency_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_agency_expenses" ON public.agency_expenses FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add pricing_config JSONB to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pricing_config JSONB;
