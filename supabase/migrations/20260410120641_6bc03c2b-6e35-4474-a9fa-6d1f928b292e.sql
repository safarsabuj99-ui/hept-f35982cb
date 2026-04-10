CREATE POLICY "platform_owner_all_ad_accounts"
  ON public.ad_accounts FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));

CREATE POLICY "platform_owner_all_ad_account_clients"
  ON public.ad_account_clients FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));