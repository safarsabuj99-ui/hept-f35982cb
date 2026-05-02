create or replace function public.sync_agency_expense_account_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.paid_from_account_id is not null then
      update public.agency_accounts
      set current_balance_bdt = current_balance_bdt - coalesce(new.amount_bdt, 0)
      where id = new.paid_from_account_id;

      if not found then
        raise exception 'Agency account % not found for expense %', new.paid_from_account_id, new.id;
      end if;
    end if;

    return new;
  elsif tg_op = 'UPDATE' then
    if old.paid_from_account_id is not null then
      update public.agency_accounts
      set current_balance_bdt = current_balance_bdt + coalesce(old.amount_bdt, 0)
      where id = old.paid_from_account_id;

      if not found then
        raise exception 'Previous agency account % not found for expense %', old.paid_from_account_id, old.id;
      end if;
    end if;

    if new.paid_from_account_id is not null then
      update public.agency_accounts
      set current_balance_bdt = current_balance_bdt - coalesce(new.amount_bdt, 0)
      where id = new.paid_from_account_id;

      if not found then
        raise exception 'Agency account % not found for expense %', new.paid_from_account_id, new.id;
      end if;
    end if;

    return new;
  elsif tg_op = 'DELETE' then
    if old.paid_from_account_id is not null then
      update public.agency_accounts
      set current_balance_bdt = current_balance_bdt + coalesce(old.amount_bdt, 0)
      where id = old.paid_from_account_id;

      if not found then
        raise exception 'Agency account % not found for deleted expense %', old.paid_from_account_id, old.id;
      end if;
    end if;

    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists sync_agency_expense_account_balance_on_change on public.agency_expenses;

create trigger sync_agency_expense_account_balance_on_change
after insert or update or delete on public.agency_expenses
for each row
execute function public.sync_agency_expense_account_balance();

update public.agency_accounts
set current_balance_bdt = current_balance_bdt + 18900
where id = '6f8357b5-a128-4319-bef8-7be5f647d456'
  and exists (
    select 1
    from public.agency_expenses
    where id = 'b6c421b1-b4c6-47cf-837a-8a5b52dc9098'
      and paid_from_account_id = '6f8357b5-a128-4319-bef8-7be5f647d456'
      and amount_bdt = 2100
  );