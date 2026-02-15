
-- Create payment method enum
CREATE TYPE public.payment_method AS ENUM ('Bank', 'bKash', 'Cash', 'Nagad');

-- Create payment request status enum
CREATE TYPE public.payment_request_status AS ENUM ('pending', 'approved', 'rejected');

-- Create payment_requests table
CREATE TABLE public.payment_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  amount_bdt NUMERIC NOT NULL CHECK (amount_bdt > 0),
  payment_method public.payment_method NOT NULL,
  transaction_id TEXT,
  status public.payment_request_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  exchange_rate_snapshot NUMERIC,
  final_amount_usd NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

-- Clients can INSERT their own requests
CREATE POLICY "client_insert_own_payment_requests"
ON public.payment_requests
FOR INSERT
TO authenticated
WITH CHECK (client_id = auth.uid() AND public.has_role(auth.uid(), 'client'));

-- Clients can read their own requests
CREATE POLICY "client_read_own_payment_requests"
ON public.payment_requests
FOR SELECT
TO authenticated
USING (client_id = auth.uid());

-- Admin full access
CREATE POLICY "admin_all_payment_requests"
ON public.payment_requests
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_payment_requests_updated_at
BEFORE UPDATE ON public.payment_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for payment_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_requests;
