
-- ============================================================
-- Enterprise Upgrade: Schema, RLS, Triggers
-- ============================================================

-- Helper function for auto-updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. Create transaction status enum
CREATE TYPE public.transaction_status AS ENUM ('pending_approval', 'completed', 'rejected');

-- 2. Add new columns to transactions
ALTER TABLE public.transactions
  ADD COLUMN status public.transaction_status NOT NULL DEFAULT 'completed',
  ADD COLUMN exchange_rate numeric;

-- 3. Add manager assignment to profiles
ALTER TABLE public.profiles ADD COLUMN manager_id uuid;

-- 4. Create settings table
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.settings (key, value) VALUES ('exchange_rate', '120');

-- 5. Create audit logs table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  description text NOT NULL,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 6. Security definer function for manager client lookup
CREATE OR REPLACE FUNCTION public.get_managed_client_ids(_manager_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM public.profiles WHERE manager_id = _manager_id
$$;

-- 7. Drop old RLS policies
DROP POLICY IF EXISTS "Admins can do everything on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can do everything on transactions" ON public.transactions;
DROP POLICY IF EXISTS "Clients can read own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can do everything on user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;

-- 8. New RLS: profiles
CREATE POLICY "admin_all_profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "manager_read_profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager') AND (manager_id = auth.uid() OR user_id = auth.uid()));

CREATE POLICY "client_read_own_profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 9. New RLS: transactions
CREATE POLICY "admin_all_transactions" ON public.transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "manager_read_transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') AND
    client_id IN (SELECT public.get_managed_client_ids(auth.uid()))
  );

CREATE POLICY "manager_insert_transactions" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'manager') AND
    client_id IN (SELECT public.get_managed_client_ids(auth.uid()))
  );

CREATE POLICY "client_read_completed_transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (client_id = auth.uid() AND status = 'completed');

-- 10. New RLS: user_roles
CREATE POLICY "admin_all_user_roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_read_own_role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 11. RLS: settings
CREATE POLICY "read_settings" ON public.settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_write_settings" ON public.settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 12. RLS: audit_logs
CREATE POLICY "admin_read_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "system_insert_logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 13. Audit trigger functions
CREATE OR REPLACE FUNCTION public.audit_transaction_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.audit_settings_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action_type, description)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'exchange_rate_changed',
    'Rate changed: ' || OLD.value || ' → ' || NEW.value
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_profile_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action_type, description)
  VALUES (
    COALESCE(auth.uid(), NEW.user_id),
    'client_created',
    'New profile: ' || NEW.full_name || ' (' || NEW.email || ')'
  );
  RETURN NEW;
END;
$$;

-- 14. Attach triggers
CREATE TRIGGER trg_audit_transaction
AFTER INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.audit_transaction_change();

CREATE TRIGGER trg_audit_settings
AFTER UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.audit_settings_change();

CREATE TRIGGER trg_audit_profile
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_profile_created();

CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
