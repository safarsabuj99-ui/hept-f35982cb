
-- AI Copilot Phase 2A: agentic tool calls audit trail
CREATE TABLE IF NOT EXISTS public.ai_tool_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.ai_threads(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.ai_messages(id) ON DELETE SET NULL,
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  tool_name TEXT NOT NULL,
  args JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  latency_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_thread ON public.ai_tool_calls(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_org ON public.ai_tool_calls(org_id, created_at DESC);

ALTER TABLE public.ai_tool_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_ai_tool_calls"
  ON public.ai_tool_calls FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "manager_read_own_ai_tool_calls"
  ON public.ai_tool_calls FOR SELECT TO authenticated
  USING (user_id = auth.uid());
