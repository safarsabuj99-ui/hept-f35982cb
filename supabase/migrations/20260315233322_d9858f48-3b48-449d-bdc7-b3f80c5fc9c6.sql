
-- Feature 11: feature_usage_events
CREATE TABLE public.feature_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz DEFAULT now(),
  period date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, feature_key, period)
);
ALTER TABLE public.feature_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_owner_all_feature_usage" ON public.feature_usage_events FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));

-- Feature 13: platform_costs
CREATE TABLE public.platform_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period date NOT NULL,
  category text NOT NULL DEFAULT 'other',
  amount_bdt numeric NOT NULL DEFAULT 0,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_owner_all_costs" ON public.platform_costs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));

-- Feature 14: tenant_health_scores
CREATE TABLE public.tenant_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  activity_score integer NOT NULL DEFAULT 0,
  payment_score integer NOT NULL DEFAULT 0,
  usage_score integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_health_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_owner_all_health_scores" ON public.tenant_health_scores FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));
