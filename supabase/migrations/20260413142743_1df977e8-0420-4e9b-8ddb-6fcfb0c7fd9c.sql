
-- Attach BEFORE INSERT triggers to all finance tables using existing set_org_id_from_auth()

CREATE TRIGGER trg_set_agency_accounts_org_id
  BEFORE INSERT ON public.agency_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_auth();

CREATE TRIGGER trg_set_fund_transfers_org_id
  BEFORE INSERT ON public.fund_transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_auth();

CREATE TRIGGER trg_set_liquid_fund_entries_org_id
  BEFORE INSERT ON public.liquid_fund_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_auth();

CREATE TRIGGER trg_set_cash_withdrawals_org_id
  BEFORE INSERT ON public.cash_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_auth();

CREATE TRIGGER trg_set_cash_withdrawal_returns_org_id
  BEFORE INSERT ON public.cash_withdrawal_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_auth();

CREATE TRIGGER trg_set_agency_expenses_org_id
  BEFORE INSERT ON public.agency_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_auth();

CREATE TRIGGER trg_set_usd_purchases_org_id
  BEFORE INSERT ON public.usd_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_auth();

CREATE TRIGGER trg_set_usd_manual_spends_org_id
  BEFORE INSERT ON public.usd_manual_spends
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_auth();

CREATE TRIGGER trg_set_usd_inventory_snapshots_org_id
  BEFORE INSERT ON public.usd_inventory_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_auth();
