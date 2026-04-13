
ALTER TABLE public.transactions DISABLE TRIGGER trg_audit_transaction;
ALTER TABLE public.transactions DISABLE TRIGGER trg_auto_pause_on_debit;
ALTER TABLE public.transactions DISABLE TRIGGER trg_check_auto_resume;

UPDATE public.transactions 
SET org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' 
WHERE org_id IS NULL;

ALTER TABLE public.transactions ENABLE TRIGGER trg_audit_transaction;
ALTER TABLE public.transactions ENABLE TRIGGER trg_auto_pause_on_debit;
ALTER TABLE public.transactions ENABLE TRIGGER trg_check_auto_resume;
