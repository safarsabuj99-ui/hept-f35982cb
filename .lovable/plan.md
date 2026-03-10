

## Plan: Move TikTok App Secret to UI Input

### Problem
Currently the `tiktok-exchange-token` edge function reads `TIKTOK_APP_SECRET` from backend secrets. You want to enter it directly in the Add Instance dialog when creating a TikTok integration.

### Changes

**1. Update `tiktok-exchange-token` edge function**
- Accept `app_secret` from the request body instead of reading from `Deno.env`
- Validate that `app_secret` is provided alongside `auth_code` and `app_id`

**2. Update TikTok OAuth section in `src/pages/Integrations.tsx`**
- Add a new "App Secret" input field in the TikTok OAuth exchange panel
- Add state variable `tiktokAppSecret` for the field
- Pass `app_secret` to the edge function call
- The secret is only used transiently for the token exchange — not stored in the database

### Security Note
The App Secret is sent to the edge function over HTTPS, used once for the token exchange, and never stored. Only the resulting access token is saved in the database.

