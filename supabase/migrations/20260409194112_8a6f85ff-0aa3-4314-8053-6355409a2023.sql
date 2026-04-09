
-- Enable extensions needed for scheduled jobs and async HTTP
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================
-- 1. Replace instant_guard_pause to use hardcoded URL/key
--    (same pattern as trigger_send_push — no vault dependency)
-- ============================================================
CREATE OR REPLACE FUNCTION public.instant_guard_pause()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only fire when status just changed to guard_paused
  IF NEW.status <> 'guard_paused' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'guard_paused' THEN
    RETURN NEW;
  END IF;

  -- Fire async HTTP POST to pause-campaign edge function
  -- Using hardcoded URL + anon key (same pattern as push trigger)
  PERFORM net.http_post(
    url := 'https://hhpiimnvkgmpfnldgdhc.supabase.co/functions/v1/pause-campaign',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocGlpbW52a2dtcGZubGRnZGhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDI5NTksImV4cCI6MjA4NjcxODk1OX0.-rT23NY6GRn-9Q5cgraDlzu6gazbPj1al8ouvmgZmI4'
    ),
    body := jsonb_build_object(
      'campaign_id', NEW.id,
      'action', 'pause'
    )
  );

  RETURN NEW;
END;
$function$;

-- ============================================================
-- 2. Recreate ALL critical triggers (drop first to avoid duplicates)
-- ============================================================

-- Auto-pause on debit
DROP TRIGGER IF EXISTS trg_auto_pause_on_debit ON public.transactions;
CREATE TRIGGER trg_auto_pause_on_debit
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_pause_on_debit();

-- Auto-resume on credit
DROP TRIGGER IF EXISTS trg_check_auto_resume ON public.transactions;
CREATE TRIGGER trg_check_auto_resume
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_auto_resume();

-- Instant guard pause (fires HTTP to pause-campaign)
DROP TRIGGER IF EXISTS trg_instant_guard_pause ON public.campaigns;
CREATE TRIGGER trg_instant_guard_pause
  AFTER UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.instant_guard_pause();

-- Auto-debit on spend sync
DROP TRIGGER IF EXISTS trg_auto_debit_on_spend ON public.daily_metrics;
CREATE TRIGGER trg_auto_debit_on_spend
  AFTER INSERT OR UPDATE ON public.daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_debit_on_spend();

-- Audit transaction changes
DROP TRIGGER IF EXISTS trg_audit_transaction ON public.transactions;
CREATE TRIGGER trg_audit_transaction
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_transaction_change();

-- Audit profile creation
DROP TRIGGER IF EXISTS trg_audit_profile_created ON public.profiles;
CREATE TRIGGER trg_audit_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_profile_created();

-- Audit settings change
DROP TRIGGER IF EXISTS trg_audit_settings ON public.settings;
CREATE TRIGGER trg_audit_settings
  AFTER UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_settings_change();

-- Seed notification preferences for new profiles
DROP TRIGGER IF EXISTS trg_seed_notification_prefs ON public.profiles;
CREATE TRIGGER trg_seed_notification_prefs
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_notification_preferences();

-- Push notification delivery
DROP TRIGGER IF EXISTS on_notification_send_push ON public.notifications;
CREATE TRIGGER on_notification_send_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_push();

-- Notify on guard pause
DROP TRIGGER IF EXISTS trg_notify_guard_pause ON public.campaigns;
CREATE TRIGGER trg_notify_guard_pause
  AFTER UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_guard_pause();

-- Notify on guard resume
DROP TRIGGER IF EXISTS trg_notify_guard_resume ON public.campaigns;
CREATE TRIGGER trg_notify_guard_resume
  AFTER UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_guard_resume();

-- Notify on payment request created
DROP TRIGGER IF EXISTS trg_notify_payment_request ON public.payment_requests;
CREATE TRIGGER trg_notify_payment_request
  AFTER INSERT ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_payment_request_created();

-- Notify on payment status change
DROP TRIGGER IF EXISTS trg_notify_payment_status ON public.payment_requests;
CREATE TRIGGER trg_notify_payment_status
  AFTER UPDATE ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_payment_status_change();

-- Notify on campaign request
DROP TRIGGER IF EXISTS trg_notify_campaign_request ON public.campaign_requests;
CREATE TRIGGER trg_notify_campaign_request
  AFTER INSERT OR UPDATE ON public.campaign_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_campaign_request();

-- Updated_at triggers
DROP TRIGGER IF EXISTS update_transactions_updated_at ON public.transactions;
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_requests_updated_at ON public.payment_requests;
CREATE TRIGGER update_payment_requests_updated_at
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaign_requests_updated_at ON public.campaign_requests;
CREATE TRIGGER update_campaign_requests_updated_at
  BEFORE UPDATE ON public.campaign_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_cash_withdrawals_updated_at ON public.cash_withdrawals;
CREATE TRIGGER update_cash_withdrawals_updated_at
  BEFORE UPDATE ON public.cash_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
