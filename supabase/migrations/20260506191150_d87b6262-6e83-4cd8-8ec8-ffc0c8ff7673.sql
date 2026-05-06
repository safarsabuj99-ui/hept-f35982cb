ALTER TABLE public.cash_withdrawals ADD COLUMN IF NOT EXISTS parent_withdrawal_id uuid REFERENCES public.cash_withdrawals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_parent ON public.cash_withdrawals(parent_withdrawal_id);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_borrower_lookup ON public.cash_withdrawals(from_account_id, borrower_name, status);