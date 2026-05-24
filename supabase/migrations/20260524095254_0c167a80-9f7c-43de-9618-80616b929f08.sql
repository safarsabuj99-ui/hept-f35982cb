
-- AI Campaign Builder schema
CREATE TABLE public.ai_campaign_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL,
  ad_account_id UUID NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  platform ad_platform NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','researching','ready','approved','publishing','published','failed')),
  product_brief TEXT NOT NULL DEFAULT '',
  product_url TEXT,
  product_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  research_json JSONB,
  draft_json JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  platform_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  pending_action_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_campaign_drafts_org ON public.ai_campaign_drafts(org_id, status, created_at DESC);
CREATE INDEX idx_ai_campaign_drafts_user ON public.ai_campaign_drafts(user_id, created_at DESC);
CREATE INDEX idx_ai_campaign_drafts_client ON public.ai_campaign_drafts(client_id);

CREATE TABLE public.ai_campaign_draft_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_id UUID NOT NULL REFERENCES public.ai_campaign_drafts(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  draft_json JSONB NOT NULL,
  edited_by UUID,
  change_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_draft_versions_draft ON public.ai_campaign_draft_versions(draft_id, version DESC);

CREATE TABLE public.ai_campaign_publish_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_id UUID NOT NULL REFERENCES public.ai_campaign_drafts(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL,
  node_label TEXT,
  platform_id TEXT,
  request JSONB,
  response JSONB,
  error TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_publish_logs_draft ON public.ai_campaign_publish_logs(draft_id, created_at DESC);

-- RLS
ALTER TABLE public.ai_campaign_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_campaign_draft_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_campaign_publish_logs ENABLE ROW LEVEL SECURITY;

-- Drafts policies
CREATE POLICY "admin_manager_all_drafts" ON public.ai_campaign_drafts
  TO authenticated
  USING (
    org_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  )
  WITH CHECK (
    org_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  );

CREATE POLICY "platform_owner_all_drafts" ON public.ai_campaign_drafts
  TO authenticated
  USING (has_role(auth.uid(),'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(),'platform_owner'::app_role));

CREATE POLICY "client_read_own_drafts" ON public.ai_campaign_drafts
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- Versions policies
CREATE POLICY "admin_manager_all_draft_versions" ON public.ai_campaign_draft_versions
  TO authenticated
  USING (
    org_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  )
  WITH CHECK (
    org_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  );

CREATE POLICY "platform_owner_all_draft_versions" ON public.ai_campaign_draft_versions
  TO authenticated
  USING (has_role(auth.uid(),'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(),'platform_owner'::app_role));

-- Publish logs policies
CREATE POLICY "admin_manager_all_publish_logs" ON public.ai_campaign_publish_logs
  TO authenticated
  USING (
    org_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  )
  WITH CHECK (
    org_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  );

CREATE POLICY "platform_owner_all_publish_logs" ON public.ai_campaign_publish_logs
  TO authenticated
  USING (has_role(auth.uid(),'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(),'platform_owner'::app_role));

-- Auto-stamp org_id trigger
CREATE OR REPLACE FUNCTION public.ai_campaign_drafts_set_org()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER set_org_ai_campaign_drafts BEFORE INSERT ON public.ai_campaign_drafts
  FOR EACH ROW EXECUTE FUNCTION public.ai_campaign_drafts_set_org();

-- updated_at trigger
CREATE TRIGGER update_ai_campaign_drafts_updated_at
  BEFORE UPDATE ON public.ai_campaign_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
