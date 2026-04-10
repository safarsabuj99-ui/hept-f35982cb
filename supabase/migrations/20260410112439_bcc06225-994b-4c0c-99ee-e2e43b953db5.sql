
-- Add feature_flags to platform_plans
ALTER TABLE public.platform_plans
ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Add allowed_features to organizations
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS allowed_features jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Update existing plans with default feature_flags
-- Starter: basic features only
UPDATE public.platform_plans
SET feature_flags = jsonb_build_object(
  'ad_guard', true,
  'advanced_analytics', false,
  'api_access', false,
  'white_label', false,
  'campaign_requests', true,
  'multi_manager', false,
  'priority_support', false,
  'expense_tracking', false,
  'cash_flow', false,
  'usd_inventory', false,
  'custom_exchange_rate', false,
  'client_notices', true
)
WHERE key = 'starter';

-- Growth: mid-tier features
UPDATE public.platform_plans
SET feature_flags = jsonb_build_object(
  'ad_guard', true,
  'advanced_analytics', true,
  'api_access', true,
  'white_label', false,
  'campaign_requests', true,
  'multi_manager', true,
  'priority_support', false,
  'expense_tracking', true,
  'cash_flow', false,
  'usd_inventory', false,
  'custom_exchange_rate', true,
  'client_notices', true
)
WHERE key = 'growth';

-- Agency Pro: all features
UPDATE public.platform_plans
SET feature_flags = jsonb_build_object(
  'ad_guard', true,
  'advanced_analytics', true,
  'api_access', true,
  'white_label', true,
  'campaign_requests', true,
  'multi_manager', true,
  'priority_support', true,
  'expense_tracking', true,
  'cash_flow', true,
  'usd_inventory', true,
  'custom_exchange_rate', true,
  'client_notices', true
)
WHERE key = 'agency_pro';

-- Sync allowed_features to existing organizations from their plan
UPDATE public.organizations o
SET allowed_features = COALESCE(
  (SELECT pp.feature_flags FROM public.platform_plans pp WHERE pp.key = o.plan::text LIMIT 1),
  '{}'::jsonb
);
