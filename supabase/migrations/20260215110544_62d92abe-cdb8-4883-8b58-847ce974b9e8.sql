
-- Delete the broken user and recreate properly
DELETE FROM public.user_roles WHERE user_id = (SELECT id FROM auth.users WHERE email = 'admin@agency.com');
DELETE FROM public.profiles WHERE user_id = (SELECT id FROM auth.users WHERE email = 'admin@agency.com');
DELETE FROM auth.identities WHERE user_id = (SELECT id FROM auth.users WHERE email = 'admin@agency.com');
DELETE FROM auth.users WHERE email = 'admin@agency.com';

-- Recreate with ALL required fields set
CREATE OR REPLACE FUNCTION public.temp_create_admin_v2()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    phone_change_token, reauthentication_token, email_change, phone, phone_change,
    email_change_confirm_status, is_sso_user
  ) VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    'admin@agency.com',
    extensions.crypt('Admin123!', extensions.gen_salt('bf')),
    now(),
    'authenticated',
    'authenticated',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Agency Admin"}',
    now(),
    now(),
    '', '', '', '', '', '', '', '', '',
    0,
    false
  );

  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    new_user_id,
    'admin@agency.com',
    jsonb_build_object('sub', new_user_id::text, 'email', 'admin@agency.com', 'email_verified', true),
    'email',
    now(),
    now(),
    now()
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (new_user_id, 'admin');
END;
$$;

SELECT public.temp_create_admin_v2();
DROP FUNCTION public.temp_create_admin_v2();
