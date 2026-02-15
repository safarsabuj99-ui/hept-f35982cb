
-- Create enums for campaign requests
CREATE TYPE public.campaign_objective AS ENUM ('Message', 'Traffic/Website', 'Video Views', 'Sales');
CREATE TYPE public.campaign_request_status AS ENUM ('pending', 'processing', 'completed', 'rejected');

-- Create campaign_requests table
CREATE TABLE public.campaign_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  platform public.ad_platform NOT NULL,
  objective public.campaign_objective NOT NULL,
  creative_link TEXT NOT NULL,
  landing_page_url TEXT,
  budget_usd NUMERIC NOT NULL,
  start_date DATE NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 7,
  target_audience_note TEXT,
  ad_caption TEXT,
  status public.campaign_request_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.campaign_requests ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_all_campaign_requests"
ON public.campaign_requests
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Client can insert own requests
CREATE POLICY "client_insert_own_campaign_requests"
ON public.campaign_requests
FOR INSERT
TO authenticated
WITH CHECK (client_id = auth.uid() AND public.has_role(auth.uid(), 'client'));

-- Client can read own requests
CREATE POLICY "client_read_own_campaign_requests"
ON public.campaign_requests
FOR SELECT
TO authenticated
USING (client_id = auth.uid());

-- Manager can read requests of managed clients
CREATE POLICY "manager_read_campaign_requests"
ON public.campaign_requests
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager') AND
  client_id IN (SELECT public.get_managed_client_ids(auth.uid()))
);

-- Trigger for updated_at
CREATE TRIGGER update_campaign_requests_updated_at
BEFORE UPDATE ON public.campaign_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_requests;
