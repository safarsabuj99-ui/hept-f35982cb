
ALTER TABLE public.ai_campaign_drafts
  ADD COLUMN IF NOT EXISTS agent_stage TEXT,
  ADD COLUMN IF NOT EXISTS agent_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS past_performance_json JSONB,
  ADD COLUMN IF NOT EXISTS strategy_json JSONB;
