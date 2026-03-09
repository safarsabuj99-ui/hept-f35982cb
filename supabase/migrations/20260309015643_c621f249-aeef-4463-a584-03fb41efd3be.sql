
CREATE OR REPLACE FUNCTION public.audit_transaction_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip auto_spend debits (routine noise from daily sync)
  IF TG_OP = 'INSERT' AND NEW.description LIKE 'auto_spend:%' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, action_type, description)
    VALUES (
      COALESCE(auth.uid(), NEW.created_by),
      CASE WHEN NEW.type = 'credit' THEN 'funds_added' ELSE 'spend_logged' END,
      CASE WHEN NEW.type = 'credit'
        THEN 'Deposit $' || NEW.amount || ' (status: ' || NEW.status || ')'
        ELSE 'Spend $' || NEW.amount || ' on ' || COALESCE(NEW.platform::text, 'N/A')
      END
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_logs (user_id, action_type, description)
    VALUES (
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      'transaction_' || NEW.status::text,
      'Transaction ' || NEW.id || ' → ' || NEW.status::text
    );
  END IF;
  RETURN NEW;
END;
$function$;
