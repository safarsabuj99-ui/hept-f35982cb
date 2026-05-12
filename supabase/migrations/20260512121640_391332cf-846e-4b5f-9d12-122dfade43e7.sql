
CREATE TABLE IF NOT EXISTS public.platform_payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL,
  display_name text NOT NULL,
  mode text NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox', 'live')),
  is_enabled boolean NOT NULL DEFAULT false,
  supported_currencies text[] NOT NULL DEFAULT ARRAY['BDT']::text[],
  priority int NOT NULL DEFAULT 100,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_tested_at timestamptz,
  last_test_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_payment_gateways_gateway_unique UNIQUE (gateway)
);

ALTER TABLE public.platform_payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_full_access_gateways"
  ON public.platform_payment_gateways
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));

CREATE TRIGGER platform_payment_gateways_updated_at
  BEFORE UPDATE ON public.platform_payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_active_gateways_for_currency(_currency text)
RETURNS TABLE (
  id uuid,
  gateway text,
  display_name text,
  mode text,
  supported_currencies text[],
  priority int,
  public_config jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, gateway, display_name, mode, supported_currencies, priority, public_config
  FROM public.platform_payment_gateways
  WHERE is_enabled = true
    AND (_currency IS NULL OR _currency = ANY(supported_currencies))
  ORDER BY priority ASC, display_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_gateways_for_currency(text) TO authenticated;
