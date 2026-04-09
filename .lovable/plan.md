

## Fix Push Notifications — Root Cause & Plan

### Problem
The database trigger `trigger_send_push` (which calls the `send-push` edge function when a notification is inserted) **does not exist** on the `notifications` table. The function exists, but no trigger connects it. So notifications are created in the database, but the push delivery step never fires.

### Fix

**1. Create the missing trigger (database migration)**

```sql
-- Ensure pg_net is enabled for async HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Attach trigger to notifications table
CREATE TRIGGER on_notification_send_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_push();
```

**2. Store vault secrets for the trigger function**

The `trigger_send_push` function reads `supabase_url` and `service_role_key` from `vault.decrypted_secrets`. These need to be inserted:

```sql
SELECT vault.create_secret(
  current_setting('app.settings.supabase_url', true),
  'supabase_url'
);
SELECT vault.create_secret(
  current_setting('app.settings.service_role_key', true),
  'service_role_key'
);
```

Since we can't read vault to verify, the migration will use `INSERT ... ON CONFLICT DO NOTHING` with the actual Supabase URL and service role key values sourced from environment.

**3. Verify edge function is deployed**

Check that `send-push` is deployed and callable. Redeploy if needed.

### Files Changed
- **New migration** — creates the trigger + vault secrets
- No application code changes needed

### Expected Result
After this fix, every new row in the `notifications` table will fire the trigger → call `send-push` edge function → deliver a browser push notification to users who have subscribed.

