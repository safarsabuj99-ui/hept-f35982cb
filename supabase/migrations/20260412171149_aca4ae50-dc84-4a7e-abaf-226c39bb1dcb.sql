
-- Add 'affiliate' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'affiliate';

-- Affiliates table
CREATE TABLE public.affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  payment_method TEXT DEFAULT 'bkash',
  payment_details JSONB DEFAULT '{}',
  commission_rate NUMERIC NOT NULL DEFAULT 10,
  commission_type TEXT NOT NULL DEFAULT 'percentage',
  status TEXT NOT NULL DEFAULT 'pending',
  total_earnings_bdt NUMERIC NOT NULL DEFAULT 0,
  total_paid_bdt NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affiliates_own_read" ON public.affiliates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'platform_owner'));

CREATE POLICY "affiliates_own_update" ON public.affiliates
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "platform_owner_manage_affiliates" ON public.affiliates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));

-- Affiliate links table
CREATE TABLE public.affiliate_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT 'Default',
  clicks INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.affiliate_links ENABLE ROW LEVEL SECURITY;

-- Public read for click tracking
CREATE POLICY "affiliate_links_public_read" ON public.affiliate_links
  FOR SELECT USING (true);

CREATE POLICY "affiliate_links_own_insert" ON public.affiliate_links
  FOR INSERT TO authenticated
  WITH CHECK (
    affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
  );

CREATE POLICY "affiliate_links_own_update" ON public.affiliate_links
  FOR UPDATE TO authenticated
  USING (
    affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
  );

CREATE POLICY "platform_owner_manage_affiliate_links" ON public.affiliate_links
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));

-- Affiliate conversions table
CREATE TABLE public.affiliate_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  link_id UUID REFERENCES public.affiliate_links(id),
  referred_org_id UUID REFERENCES public.organizations(id),
  referred_org_name TEXT,
  signup_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_payment_at TIMESTAMPTZ,
  payment_amount_bdt NUMERIC DEFAULT 0,
  commission_bdt NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  qualified_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.affiliate_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affiliate_conversions_own_read" ON public.affiliate_conversions
  FOR SELECT TO authenticated
  USING (
    affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'platform_owner')
  );

CREATE POLICY "platform_owner_manage_conversions" ON public.affiliate_conversions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));

-- Affiliate payouts table
CREATE TABLE public.affiliate_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  amount_bdt NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  payment_details JSONB DEFAULT '{}',
  admin_note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affiliate_payouts_own_read" ON public.affiliate_payouts
  FOR SELECT TO authenticated
  USING (
    affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'platform_owner')
  );

CREATE POLICY "affiliate_payouts_own_insert" ON public.affiliate_payouts
  FOR INSERT TO authenticated
  WITH CHECK (
    affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
  );

CREATE POLICY "platform_owner_manage_payouts" ON public.affiliate_payouts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));

-- Add referred_by_affiliate_id to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS referred_by_affiliate_id UUID REFERENCES public.affiliates(id);
