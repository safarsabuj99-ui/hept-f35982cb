ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'Transfer_Fee';

ALTER TABLE public.agency_accounts
  ADD COLUMN IF NOT EXISTS default_out_fee_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_out_fee_flat_bdt numeric NOT NULL DEFAULT 0;

ALTER TABLE public.fund_transfers
  ADD COLUMN IF NOT EXISTS fee_bdt numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_percent numeric,
  ADD COLUMN IF NOT EXISTS fee_expense_id uuid REFERENCES public.agency_expenses(id) ON DELETE SET NULL;