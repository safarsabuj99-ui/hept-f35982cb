
CREATE OR REPLACE FUNCTION public.temp_create_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  new_user_id uuid;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'admin@agency.com',
    extensions.crypt('Admin123!', extensions.gen_salt('bf')),
    now(),
    'authenticated',
    'authenticated',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Agency Admin"}',
    now(),
    now()
  )
  RETURNING id INTO new_user_id;

  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    new_user_id,
    'admin@agency.com',
    jsonb_build_object('sub', new_user_id::text, 'email', 'admin@agency.com'),
    'email',
    now(),
    now(),
    now()
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (new_user_id, 'admin');
END;
$$;

SELECT public.temp_create_admin();
DROP FUNCTION public.temp_create_admin();
