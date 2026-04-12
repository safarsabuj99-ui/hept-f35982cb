
-- =============================================
-- ENUMS
-- =============================================
CREATE TYPE public.payment_gateway_type AS ENUM ('sslcommerz', 'stripe', 'manual');
CREATE TYPE public.gateway_txn_status AS ENUM ('initiated', 'success', 'failed', 'cancelled');
CREATE TYPE public.metering_metric AS ENUM ('api_calls', 'storage_mb', 'sync_runs', 'ad_accounts', 'clients', 'managers');
CREATE TYPE public.plan_change_status AS ENUM ('pending', 'completed', 'cancelled');
CREATE TYPE public.email_send_status AS ENUM ('queued', 'sent', 'failed', 'bounced');
CREATE TYPE public.email_trigger_type AS ENUM ('event', 'cron');
CREATE TYPE public.dunning_status AS ENUM ('active', 'recovered', 'exhausted', 'cancelled');
CREATE TYPE public.dunning_action AS ENUM ('email', 'restrict', 'suspend', 'write_off');
CREATE TYPE public.acquisition_cost_type AS ENUM ('marketing', 'sales', 'onboarding', 'referral');
CREATE TYPE public.commission_type AS ENUM ('percentage', 'fixed_amount');
CREATE TYPE public.referral_status AS ENUM ('pending', 'qualified', 'paid', 'expired');
CREATE TYPE public.support_priority_level AS ENUM ('standard', 'priority', 'dedicated');
CREATE TYPE public.ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'waiting', 'resolved', 'closed');
CREATE TYPE public.legal_doc_type AS ENUM ('tos', 'privacy_policy', 'dpa', 'sla_agreement', 'acceptable_use');
CREATE TYPE public.export_request_status AS ENUM ('pending', 'processing', 'ready', 'downloaded', 'expired');

-- =============================================
-- FEATURE 1: Payment Gateway
-- =============================================
CREATE TABLE public.payment_gateway_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  gateway public.payment_gateway_type NOT NULL DEFAULT 'manual',
  is_active BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_gateway_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on payment_gateway_config" ON public.payment_gateway_config FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Org admins read own gateway config" ON public.payment_gateway_config FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()));

CREATE TABLE public.gateway_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.organization_subscriptions(id),
  invoice_id UUID REFERENCES public.platform_invoices(id),
  gateway public.payment_gateway_type NOT NULL,
  gateway_txn_id TEXT,
  amount_bdt NUMERIC NOT NULL DEFAULT 0,
  status public.gateway_txn_status NOT NULL DEFAULT 'initiated',
  gateway_response JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.gateway_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on gateway_transactions" ON public.gateway_transactions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Org admins read own gateway txns" ON public.gateway_transactions FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()));

ALTER TABLE public.organization_subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT false;

-- =============================================
-- FEATURE 2: Usage Metering
-- =============================================
CREATE TABLE public.usage_metering_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric_type public.metering_metric NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  billing_period DATE NOT NULL DEFAULT (date_trunc('month', now()))::date
);
CREATE INDEX idx_usage_metering_org_period ON public.usage_metering_logs(org_id, billing_period, metric_type);
ALTER TABLE public.usage_metering_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on usage_metering_logs" ON public.usage_metering_logs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Org admins read own usage" ON public.usage_metering_logs FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()));

CREATE TABLE public.overage_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.platform_invoices(id),
  metric_type public.metering_metric NOT NULL,
  included_limit INT NOT NULL DEFAULT 0,
  actual_usage NUMERIC NOT NULL DEFAULT 0,
  overage_units NUMERIC NOT NULL DEFAULT 0,
  rate_per_unit_bdt NUMERIC NOT NULL DEFAULT 0,
  total_bdt NUMERIC NOT NULL DEFAULT 0,
  billing_period DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.overage_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on overage_charges" ON public.overage_charges FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Org admins read own overages" ON public.overage_charges FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()));

ALTER TABLE public.platform_plans ADD COLUMN IF NOT EXISTS api_call_limit INT NOT NULL DEFAULT 10000;
ALTER TABLE public.platform_plans ADD COLUMN IF NOT EXISTS storage_limit_mb INT NOT NULL DEFAULT 500;
ALTER TABLE public.platform_plans ADD COLUMN IF NOT EXISTS sync_run_limit INT NOT NULL DEFAULT 100;
ALTER TABLE public.platform_plans ADD COLUMN IF NOT EXISTS overage_rate_bdt JSONB NOT NULL DEFAULT '{"api_calls": 0.5, "storage_mb": 2, "sync_runs": 5}';

-- =============================================
-- FEATURE 3: Self-Service Plan Changes
-- =============================================
CREATE TABLE public.plan_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_plan TEXT NOT NULL,
  to_plan TEXT NOT NULL,
  from_cycle TEXT,
  to_cycle TEXT,
  proration_credit_bdt NUMERIC NOT NULL DEFAULT 0,
  proration_charge_bdt NUMERIC NOT NULL DEFAULT 0,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.plan_change_status NOT NULL DEFAULT 'pending',
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.plan_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on plan_change_log" ON public.plan_change_log FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Org admins read own plan changes" ON public.plan_change_log FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()));

ALTER TABLE public.platform_plans ADD COLUMN IF NOT EXISTS allow_self_upgrade BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.platform_plans ADD COLUMN IF NOT EXISTS allow_self_downgrade BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.platform_plans ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BDT';

-- =============================================
-- FEATURE 4: Customer Communication
-- =============================================
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  subject_en TEXT NOT NULL DEFAULT '',
  subject_bn TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  variables JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on email_templates" ON public.email_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));

CREATE TABLE public.email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id UUID,
  template_key TEXT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  status public.email_send_status NOT NULL DEFAULT 'queued',
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_log_org ON public.email_log(org_id, created_at DESC);
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on email_log" ON public.email_log FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Org admins read own email log" ON public.email_log FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()));

CREATE TABLE public.email_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL REFERENCES public.email_templates(key),
  trigger_type public.email_trigger_type NOT NULL DEFAULT 'event',
  trigger_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on email_schedules" ON public.email_schedules FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));

-- =============================================
-- FEATURE 5: Dunning Management
-- =============================================
CREATE TABLE public.dunning_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Default',
  steps JSONB NOT NULL DEFAULT '[{"day":1,"action":"email","template":"payment_reminder_1"},{"day":3,"action":"email","template":"payment_reminder_2"},{"day":7,"action":"restrict"},{"day":14,"action":"suspend"}]',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dunning_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on dunning_schedules" ON public.dunning_schedules FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));

CREATE TABLE public.dunning_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.organization_subscriptions(id),
  invoice_id UUID REFERENCES public.platform_invoices(id),
  schedule_id UUID REFERENCES public.dunning_schedules(id),
  current_step INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_action_at TIMESTAMPTZ,
  status public.dunning_status NOT NULL DEFAULT 'active',
  recovery_amount_bdt NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dunning_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on dunning_runs" ON public.dunning_runs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Org admins read own dunning" ON public.dunning_runs FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()));

-- =============================================
-- FEATURE 6: Financial Reporting
-- =============================================
ALTER TABLE public.mrr_snapshots ADD COLUMN IF NOT EXISTS reactivation_mrr NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.mrr_snapshots ADD COLUMN IF NOT EXISTS upgrade_mrr NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.mrr_snapshots ADD COLUMN IF NOT EXISTS downgrade_mrr NUMERIC NOT NULL DEFAULT 0;

CREATE TABLE public.acquisition_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  cost_type public.acquisition_cost_type NOT NULL,
  amount_bdt NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.acquisition_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on acquisition_costs" ON public.acquisition_costs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));

-- =============================================
-- FEATURE 7: Multi-Currency
-- =============================================
CREATE TABLE public.currency_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL DEFAULT 'USD',
  to_currency TEXT NOT NULL DEFAULT 'BDT',
  rate NUMERIC NOT NULL DEFAULT 120,
  source TEXT NOT NULL DEFAULT 'manual',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on currency_rates" ON public.currency_rates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Authenticated read currency_rates" ON public.currency_rates FOR SELECT TO authenticated USING (true);

ALTER TABLE public.organization_subscriptions ADD COLUMN IF NOT EXISTS billing_currency TEXT NOT NULL DEFAULT 'BDT';
ALTER TABLE public.platform_invoices ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BDT';

-- =============================================
-- FEATURE 8: Referral Program
-- =============================================
CREATE TABLE public.referral_program (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Default Referral Program',
  commission_type public.commission_type NOT NULL DEFAULT 'percentage',
  commission_value NUMERIC NOT NULL DEFAULT 10,
  min_months INT NOT NULL DEFAULT 1,
  max_payouts INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_program ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on referral_program" ON public.referral_program FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Authenticated read referral_program" ON public.referral_program FOR SELECT TO authenticated USING (true);

CREATE TABLE public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  program_id UUID REFERENCES public.referral_program(id),
  uses_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on referral_codes" ON public.referral_codes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Org admins read own referral codes" ON public.referral_codes FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()));

CREATE TABLE public.referral_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID NOT NULL REFERENCES public.referral_codes(id),
  referred_org_id UUID NOT NULL REFERENCES public.organizations(id),
  referrer_org_id UUID NOT NULL REFERENCES public.organizations(id),
  status public.referral_status NOT NULL DEFAULT 'pending',
  qualified_at TIMESTAMPTZ,
  commission_bdt NUMERIC NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on referral_tracking" ON public.referral_tracking FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Org admins read own referrals" ON public.referral_tracking FOR SELECT TO authenticated USING (referrer_org_id = public.get_user_org_id(auth.uid()) OR referred_org_id = public.get_user_org_id(auth.uid()));

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS referred_by_code TEXT;

-- =============================================
-- FEATURE 9: SLA & Support
-- =============================================
CREATE TABLE public.support_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key TEXT NOT NULL,
  priority_level public.support_priority_level NOT NULL DEFAULT 'standard',
  response_time_hours INT NOT NULL DEFAULT 48,
  resolution_time_hours INT NOT NULL DEFAULT 168,
  channels JSONB NOT NULL DEFAULT '["email"]',
  dedicated_manager BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.support_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on support_tiers" ON public.support_tiers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Authenticated read support_tiers" ON public.support_tiers FOR SELECT TO authenticated USING (true);

CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  status public.ticket_status NOT NULL DEFAULT 'open',
  assigned_to UUID,
  tier_id UUID REFERENCES public.support_tiers(id),
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  sla_breached BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_tickets_org ON public.support_tickets(org_id, status);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on support_tickets" ON public.support_tickets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Org users manage own tickets" ON public.support_tickets FOR ALL TO authenticated USING (org_id = public.get_user_org_id(auth.uid())) WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE TABLE public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on ticket_messages" ON public.ticket_messages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Org users manage own ticket messages" ON public.ticket_messages FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.support_tickets st WHERE st.id = ticket_id AND st.org_id = public.get_user_org_id(auth.uid()))
  AND is_internal = false
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.support_tickets st WHERE st.id = ticket_id AND st.org_id = public.get_user_org_id(auth.uid()))
  AND is_internal = false
);

CREATE TABLE public.sla_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  tickets_total INT NOT NULL DEFAULT 0,
  tickets_resolved INT NOT NULL DEFAULT 0,
  avg_response_hours NUMERIC NOT NULL DEFAULT 0,
  avg_resolution_hours NUMERIC NOT NULL DEFAULT 0,
  sla_breach_count INT NOT NULL DEFAULT 0,
  satisfaction_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, month)
);
ALTER TABLE public.sla_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on sla_metrics" ON public.sla_metrics FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Org admins read own sla metrics" ON public.sla_metrics FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()));

-- Enable realtime for support
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;

-- =============================================
-- FEATURE 10: Legal & Compliance
-- =============================================
CREATE TABLE public.legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.legal_doc_type NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  title TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  is_current BOOLEAN NOT NULL DEFAULT false,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on legal_documents" ON public.legal_documents FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Authenticated read current legal docs" ON public.legal_documents FOR SELECT TO authenticated USING (is_current = true);

CREATE TABLE public.document_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  document_id UUID NOT NULL REFERENCES public.legal_documents(id),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);
ALTER TABLE public.document_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on document_acceptances" ON public.document_acceptances FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Users manage own acceptances" ON public.document_acceptances FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.data_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  status public.export_request_status NOT NULL DEFAULT 'pending',
  export_url TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform owner full access on data_export_requests" ON public.data_export_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'platform_owner')) WITH CHECK (public.has_role(auth.uid(), 'platform_owner'));
CREATE POLICY "Org admins manage own export requests" ON public.data_export_requests FOR ALL TO authenticated USING (org_id = public.get_user_org_id(auth.uid())) WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

-- =============================================
-- SEED DATA
-- =============================================

-- Seed default dunning schedule
INSERT INTO public.dunning_schedules (name, is_default, steps) VALUES (
  'Default Dunning Schedule', true,
  '[{"day":1,"action":"email","template":"payment_reminder_1"},{"day":3,"action":"email","template":"payment_reminder_2"},{"day":7,"action":"restrict"},{"day":14,"action":"suspend"}]'
);

-- Seed support tiers
INSERT INTO public.support_tiers (plan_key, priority_level, response_time_hours, resolution_time_hours, channels, dedicated_manager) VALUES
  ('starter', 'standard', 48, 168, '["email"]', false),
  ('growth', 'priority', 24, 72, '["email","chat"]', false),
  ('agency_pro', 'dedicated', 4, 24, '["email","chat","phone"]', true);

-- Seed initial currency rate
INSERT INTO public.currency_rates (from_currency, to_currency, rate, source) VALUES ('USD', 'BDT', 120, 'manual');

-- Seed default email templates
INSERT INTO public.email_templates (key, subject_en, subject_bn, body_html, body_text, variables) VALUES
  ('welcome', 'Welcome to {{platform_name}}!', '{{platform_name}} এ স্বাগতম!', '<h1>Welcome {{org_name}}!</h1><p>Your agency account is ready.</p>', 'Welcome {{org_name}}! Your agency account is ready.', '["org_name","platform_name","login_url"]'),
  ('trial_expiring', 'Your trial expires in {{days_left}} days', 'আপনার ট্রায়াল {{days_left}} দিনে শেষ হবে', '<h1>Trial Expiring</h1><p>{{org_name}}, your trial expires in {{days_left}} days. Upgrade now to continue.</p>', '{{org_name}}, your trial expires in {{days_left}} days.', '["org_name","days_left","upgrade_url"]'),
  ('payment_received', 'Payment Confirmed - ৳{{amount}}', 'পেমেন্ট নিশ্চিত - ৳{{amount}}', '<h1>Payment Received</h1><p>We received ৳{{amount}} for {{org_name}}. Your subscription is active until {{period_end}}.</p>', 'Payment of ৳{{amount}} received for {{org_name}}.', '["org_name","amount","period_end"]'),
  ('payment_failed', 'Payment Failed - Action Required', 'পেমেন্ট ব্যর্থ - পদক্ষেপ প্রয়োজন', '<h1>Payment Failed</h1><p>{{org_name}}, your payment of ৳{{amount}} could not be processed. Please update your payment method.</p>', 'Payment failed for {{org_name}}.', '["org_name","amount","retry_url"]'),
  ('invoice_generated', 'New Invoice #{{invoice_number}}', 'নতুন ইনভয়েস #{{invoice_number}}', '<h1>Invoice Generated</h1><p>Invoice #{{invoice_number}} for ৳{{amount}} is due on {{due_date}}.</p>', 'Invoice #{{invoice_number}} for ৳{{amount}} due on {{due_date}}.', '["org_name","invoice_number","amount","due_date"]'),
  ('subscription_suspended', 'Account Suspended - Immediate Action Required', 'অ্যাকাউন্ট স্থগিত', '<h1>Account Suspended</h1><p>{{org_name}} has been suspended due to overdue payment. Please pay to restore access.</p>', '{{org_name}} suspended due to overdue payment.', '["org_name","amount","pay_url"]'),
  ('payment_reminder_1', 'Payment Reminder - ৳{{amount}} Due', 'পেমেন্ট রিমাইন্ডার', '<p>{{org_name}}, your payment of ৳{{amount}} is overdue. Please pay to avoid service interruption.</p>', 'Payment of ৳{{amount}} is overdue.', '["org_name","amount","pay_url","days_overdue"]'),
  ('payment_reminder_2', 'Urgent: Payment Overdue - ৳{{amount}}', 'জরুরি: পেমেন্ট বকেয়া', '<p>{{org_name}}, your payment is {{days_overdue}} days overdue. Service may be restricted soon.</p>', 'Payment {{days_overdue}} days overdue.', '["org_name","amount","pay_url","days_overdue"]');

-- Create storage bucket for data exports
INSERT INTO storage.buckets (id, name, public) VALUES ('data-exports', 'data-exports', false) ON CONFLICT (id) DO NOTHING;

-- Create trigger for support ticket updated_at
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
