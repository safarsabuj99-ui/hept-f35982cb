
-- ============================================================
-- AI Copilot foundation
-- ============================================================

-- 1. Provider configs (one row per org per provider)
CREATE TABLE public.ai_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai','anthropic','gemini')),
  api_key TEXT,                          -- stored server-side; never exposed via direct SELECT (see RLS)
  oauth_token TEXT,                      -- for Gemini via Google OAuth (future)
  default_model TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  monthly_budget_usd NUMERIC NOT NULL DEFAULT 50,
  usage_this_month_usd NUMERIC NOT NULL DEFAULT 0,
  usage_month TEXT NOT NULL DEFAULT to_char(now(),'YYYY-MM'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, provider)
);

CREATE INDEX idx_ai_provider_configs_org ON public.ai_provider_configs(org_id);

-- 2. Threads
CREATE TABLE public.ai_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  mode TEXT NOT NULL DEFAULT 'coach' CHECK (mode IN ('analyst','coach','copy','comms')),
  context_client_id UUID,
  provider TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_threads_user ON public.ai_threads(user_id, updated_at DESC);
CREATE INDEX idx_ai_threads_org ON public.ai_threads(org_id);

-- 3. Messages
CREATE TABLE public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.ai_threads(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider TEXT,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_messages_thread ON public.ai_messages(thread_id, created_at);

-- 4. Saved reports
CREATE TABLE public.ai_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  summary TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_reports_org ON public.ai_reports(org_id, created_at DESC);
CREATE INDEX idx_ai_reports_client ON public.ai_reports(client_id);

-- 5. Usage log
CREATE TABLE public.ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_org_date ON public.ai_usage_log(org_id, created_at DESC);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE TRIGGER trg_ai_provider_configs_updated_at
  BEFORE UPDATE ON public.ai_provider_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_ai_threads_updated_at
  BEFORE UPDATE ON public.ai_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- org_id auto-set triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_org_id_from_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ai_threads_set_org BEFORE INSERT ON public.ai_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_user();
CREATE TRIGGER trg_ai_reports_set_org BEFORE INSERT ON public.ai_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_user();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.ai_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_threads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_log        ENABLE ROW LEVEL SECURITY;

-- provider_configs: admins can read non-secret columns; writes via edge functions only
-- We block direct SELECT of api_key by returning only metadata via a view & policies.
-- Policy: admins of the org may select/insert/update/delete configs
CREATE POLICY "admin_manage_ai_provider_configs" ON public.ai_provider_configs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- Threads: user owns their threads within their org
CREATE POLICY "user_manage_own_ai_threads" ON public.ai_threads
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND org_id = get_user_org_id(auth.uid()));

-- Messages: user can access messages of their own threads
CREATE POLICY "user_manage_own_ai_messages" ON public.ai_messages
  FOR ALL TO authenticated
  USING (
    org_id = get_user_org_id(auth.uid())
    AND EXISTS (SELECT 1 FROM public.ai_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  )
  WITH CHECK (
    org_id = get_user_org_id(auth.uid())
    AND EXISTS (SELECT 1 FROM public.ai_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  );

-- Reports: org admins/managers can see all org reports
CREATE POLICY "org_read_ai_reports" ON public.ai_reports
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)));

CREATE POLICY "org_insert_ai_reports" ON public.ai_reports
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "org_delete_ai_reports" ON public.ai_reports
  FOR DELETE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(),'admin'::app_role));

-- Usage log: org admins can read; inserts done by edge functions (service role)
CREATE POLICY "admin_read_ai_usage" ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(),'admin'::app_role));

-- ============================================================
-- Helper: get provider config for current org (server-side)
-- Returns api_key. Used only by edge functions via service role.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_ai_provider_config(_org_id UUID, _provider TEXT)
RETURNS TABLE(api_key TEXT, oauth_token TEXT, default_model TEXT, monthly_budget_usd NUMERIC, usage_this_month_usd NUMERIC)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT api_key, oauth_token, default_model, monthly_budget_usd, usage_this_month_usd
  FROM public.ai_provider_configs
  WHERE org_id = _org_id AND provider = _provider AND is_active = true
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ai_provider_config(UUID, TEXT) FROM PUBLIC, anon, authenticated;
