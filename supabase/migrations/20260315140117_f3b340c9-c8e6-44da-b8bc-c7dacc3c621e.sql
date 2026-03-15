
-- Create sync_logs table for tracking sync attempts per account
CREATE TABLE public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid REFERENCES public.ad_accounts(id) ON DELETE CASCADE NOT NULL,
  function_name text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  error_message text,
  error_code text,
  rows_synced integer DEFAULT 0,
  retry_count integer DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_sync_logs_account_function ON public.sync_logs(ad_account_id, function_name);
CREATE INDEX idx_sync_logs_status ON public.sync_logs(status);
CREATE INDEX idx_sync_logs_created_at ON public.sync_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_all_sync_logs" ON public.sync_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Platform owner read access
CREATE POLICY "platform_owner_read_sync_logs" ON public.sync_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'));
