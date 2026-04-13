CREATE POLICY "anon_read_settings" ON public.settings
  FOR SELECT TO anon USING (true);