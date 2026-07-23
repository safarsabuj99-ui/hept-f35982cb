
-- Add 'refunded' status
ALTER TYPE public.payment_request_status ADD VALUE IF NOT EXISTS 'refunded';
