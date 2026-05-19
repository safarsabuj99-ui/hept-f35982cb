-- =====================================================
-- Nova v3: memory, pending actions, scheduled missions
-- =====================================================

-- 1. AI AGENT MEMORY -----------------------------------
CREATE TABLE IF NOT EXISTS public.ai_agent_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('agency','client','user')),
  scope_id UUID,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'agent' CHECK (source IN ('user','agent')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, scope, scope_id, key)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_memory_lookup
  ON public.ai_agent_memory(org_id, scope, scope_id);

ALTER TABLE public.ai_agent_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memory_read_org"
  ON public.ai_agent_memory FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "memory_write_org_admin_manager"
  ON public.ai_agent_memory FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role))
  );

CREATE POLICY "memory_update_org_admin_manager"
  ON public.ai_agent_memory FOR UPDATE TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role))
  );

CREATE POLICY "memory_delete_org_admin"
  ON public.ai_agent_memory FOR DELETE TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND public.has_role(auth.uid(),'admin'::app_role)
  );

CREATE OR REPLACE FUNCTION public.set_ai_agent_memory_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org_id(auth.uid());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_ai_agent_memory_org
  BEFORE INSERT OR UPDATE ON public.ai_agent_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_ai_agent_memory_org();

-- 2. AI PENDING ACTIONS --------------------------------
CREATE TABLE IF NOT EXISTS public.ai_pending_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  thread_id UUID REFERENCES public.ai_threads(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.ai_messages(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  args JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','executed','failed')),
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_user_status
  ON public.ai_pending_actions(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_thread
  ON public.ai_pending_actions(thread_id, created_at);

ALTER TABLE public.ai_pending_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_action_owner_read"
  ON public.ai_pending_actions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "pending_action_owner_update"
  ON public.ai_pending_actions FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- 3. AI SCHEDULED MISSIONS -----------------------------
CREATE TABLE IF NOT EXISTS public.ai_scheduled_missions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'analyst',
  cron TEXT NOT NULL DEFAULT '0 3 * * *',
  enabled BOOLEAN NOT NULL DEFAULT true,
  notify BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  last_thread_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_missions_user ON public.ai_scheduled_missions(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_ai_missions_next ON public.ai_scheduled_missions(enabled, next_run_at);

ALTER TABLE public.ai_scheduled_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "missions_owner_all"
  ON public.ai_scheduled_missions FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND org_id = public.get_user_org_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_ai_missions_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER trg_ai_missions_updated
  BEFORE UPDATE ON public.ai_scheduled_missions
  FOR EACH ROW EXECUTE FUNCTION public.set_ai_missions_updated();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_pending_actions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agent_memory;