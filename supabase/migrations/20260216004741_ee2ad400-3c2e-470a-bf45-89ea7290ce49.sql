
-- Create billing_type enum
CREATE TYPE billing_type AS ENUM ('prepaid', 'threshold_postpaid');

-- Add columns to ad_accounts
ALTER TABLE ad_accounts
  ADD COLUMN billing_type billing_type NOT NULL DEFAULT 'prepaid',
  ADD COLUMN threshold_limit numeric DEFAULT 250,
  ADD COLUMN current_threshold_spend numeric DEFAULT 0,
  ADD COLUMN next_billing_date date,
  ADD COLUMN card_last_4 text;

-- Create billing_notifications table
CREATE TABLE billing_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  alert_type text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  message text NOT NULL,
  usage_percent numeric,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE billing_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_billing_notifications ON billing_notifications
  FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY client_read_own_billing_notifications ON billing_notifications
  FOR SELECT USING (client_id = auth.uid());

CREATE POLICY manager_read_billing_notifications ON billing_notifications
  FOR SELECT USING (
    has_role(auth.uid(), 'manager') AND
    client_id IN (SELECT get_managed_client_ids(auth.uid()))
  );
