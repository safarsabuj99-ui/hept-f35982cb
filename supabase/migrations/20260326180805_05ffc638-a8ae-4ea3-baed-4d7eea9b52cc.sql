
-- Recreate the 3 critical triggers for Ad Guard system
-- These were dropped and need to be restored

-- 1. Auto-debit trigger: creates debit transactions when daily_metrics spend is recorded
DROP TRIGGER IF EXISTS trg_auto_debit_on_spend ON public.daily_metrics;
CREATE TRIGGER trg_auto_debit_on_spend
  AFTER INSERT OR UPDATE ON public.daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_debit_on_spend();

-- 2. Auto-pause trigger: pauses campaigns when balance drops below threshold
DROP TRIGGER IF EXISTS trg_auto_pause_on_debit ON public.transactions;
CREATE TRIGGER trg_auto_pause_on_debit
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_pause_on_debit();

-- 3. Auto-resume trigger: resumes campaigns when deposit brings balance above threshold
DROP TRIGGER IF EXISTS trg_check_auto_resume ON public.transactions;
CREATE TRIGGER trg_check_auto_resume
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_auto_resume();

-- Enable pg_cron and pg_net extensions for scheduled edge function calls
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
