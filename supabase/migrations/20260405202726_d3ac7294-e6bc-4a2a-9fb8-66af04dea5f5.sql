CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON public.daily_metrics(data_date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_campaign ON public.daily_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_client_status ON public.campaigns(client_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status_created ON public.payment_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ad_account_clients_account ON public.ad_account_clients(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read);