
ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS requested_plan text,
  ADD COLUMN IF NOT EXISTS requested_billing_cycle text;
