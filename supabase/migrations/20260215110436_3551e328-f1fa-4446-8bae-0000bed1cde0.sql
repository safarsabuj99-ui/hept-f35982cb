
UPDATE auth.users
SET 
  email_change = COALESCE(email_change, ''),
  phone = COALESCE(phone, ''),
  phone_change = COALESCE(phone_change, ''),
  email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
  banned_until = banned_until,
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE email = 'admin@agency.com';
