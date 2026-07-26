# PWA Mobile Push Notifications — Deep Fix + Feature Upgrade

## What's actually broken (verified in code)

1. **Every DB-trigger push is silently rejected.** `trigger_send_push()` calls `send-push` with the **anon key**. `send-push` runs `requireCaller` → `requireRole(["admin","platform_owner"])`. Anon token has no role, so every trigger-driven push returns 401/403 and never reaches the device. This is why payment/guard/refund notifications never appear on your phone even though rows are being inserted into `notifications`.
2. **No trigger exists for manual campaign status changes.** Guard-pause fires on `status = 'guard_paused'` only. When a *client* pauses a campaign from their dashboard (`status = 'paused'`), nothing notifies the agency.
3. **Payload loses smart-gating fields.** `trigger_send_push` doesn't forward `priority` or `group_key`, so urgent guard/payment alerts get demoted to `normal` and get blocked by quiet-hours/DND that they shouldn't be blocked by.
4. **Push subscription can go stale on installed PWA.** `usePushNotifications` only re-subscribes if a subscription already exists; if the browser/OS rotates or drops the subscription (common on iOS after reinstall), we never recover it. There's also no periodic freshness check.
5. **Service worker doesn't refresh on notification click** — click handler navigates but doesn't focus reliably on Android when app is fully closed (missing `openWindow` fallback for terminated state is OK, but click deep-link uses in-app custom event that won't fire on cold start).

## What we'll build

### A. Fix the trigger → edge function auth (root cause of "no mobile push")
- Store the project's service-role key inside Postgres `vault` as `service_role_key` (one-time via a migration using existing `vault.create_secret` — value fetched from the runtime env inside a DO block so we never hardcode it).
- Rewrite `trigger_send_push()` to:
  - Read the key from vault at call time.
  - Send `Authorization: Bearer <service_role_key>` so `send-push` sees `isServiceCall = true` and bypasses the role check.
  - Forward **all** payload fields: `priority`, `group_key`, `type`, `link`.
- Effect: every existing notification row (payments, guards, refunds, campaign requests) starts delivering to the mobile lock screen immediately, with correct urgency.

### B. New notification: client pauses a campaign → agency mobile alert
Add trigger `trg_notify_on_client_pause` on `public.campaigns` AFTER UPDATE:
- Fires when `OLD.status` was an active variant and `NEW.status = 'paused'` (skip `guard_paused` — already covered).
- Distinguish *who* paused: check `auth.uid()` at trigger time. If the caller resolves to a `client` role, insert one urgent notification per agency admin/manager assigned to that client:
  - Title: `"Client Paused a Campaign ⏸️"`
  - Body: `"<Client name> paused <campaign name> (<platform>)"`
  - Link: `/admin/clients/<client_id>?tab=campaigns&highlight=<campaign_id>`
  - `type: 'campaign'`, `priority: 'high'`, `group_key: 'client_pause_<client_id>'` (30 s debounce so bulk pauses collapse into one push).
- If the pauser is an admin/manager (agency-side), skip — no self-notification.

### C. PWA subscription resilience (mobile lock-screen reliability)
- In `usePushNotifications.ts`: on every mount with `authReady` **always** call `pushManager.subscribe` when permission is granted and no subscription exists, and re-upsert the row even if the subscription already exists (keeps `keys_p256dh`/`keys_auth`/`updated_at` fresh — Chrome/Android rotates keys).
- Add a `pushsubscriptionchange` handler in `public/sw.js` that re-subscribes and posts the new endpoint to `/functions/v1/refresh-push-subscription` (new tiny edge function that upserts using service role — no auth needed because endpoint itself is the identity).
- Prune dead endpoints in `send-push`: on Web Push 404/410 response, `DELETE` from `push_subscriptions` so future notifications don't waste time on stale devices.

### D. Notification click reliability from cold-closed PWA
- Update `public/sw.js` `notificationclick`:
  - If any client window exists, `focus()` + `navigate(link)`.
  - Otherwise `clients.openWindow(link)` directly (already there, keep).
  - Fix: use absolute `new URL(link, self.location.origin).href` so relative links like `/admin/...` open correctly when the PWA is cold-started from a notification.

### E. Small hygiene
- Bump `public/sw.js` version comment to `v4` so browsers pick up the new install (`skipWaiting` on first install is already correct).
- Add a "Send test push" button in `NotificationsTab` that hits `send-push` with the current user's id — one-tap way for you to verify on your phone.

## Technical details

**Files changed**
- `supabase/migrations/<new>.sql` — new `trigger_send_push` body, vault secret bootstrap, new `notify_on_client_pause` fn + trigger.
- `supabase/functions/send-push/index.ts` — prune 404/410 subscriptions; keep existing gating.
- `supabase/functions/refresh-push-subscription/index.ts` — new, `verify_jwt = false`, upserts by endpoint.
- `supabase/config.toml` — add `[functions.refresh-push-subscription]` block.
- `public/sw.js` — v4, `pushsubscriptionchange` handler, absolute-URL fix in click handler.
- `src/hooks/usePushNotifications.ts` — always subscribe when permission granted; always upsert on mount.
- `src/components/settings/NotificationsTab.tsx` — add "Send test push" button.

**Vault bootstrap pattern (safe on Lovable Cloud)**
```sql
DO $$
DECLARE k text;
BEGIN
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF k IS NULL THEN
    PERFORM vault.create_secret(current_setting('app.settings.service_role_key', true), 'service_role_key');
  END IF;
END $$;
```
(Falls back gracefully — I'll set `app.settings.service_role_key` via a one-line `ALTER DATABASE` in the same migration, sourced from the existing project.)

**Client-pause detector logic (SQL sketch)**
```text
IF NEW.status = 'paused' AND OLD.status <> 'paused' AND OLD.status <> 'guard_paused'
   AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'client')
THEN insert one notification per admin/manager in NEW.org_id
```

**No breaking changes.** Existing notification rows keep flowing; we only fix delivery + add one new trigger + harden the SW.

## After this ships you'll get on your phone
- Client pauses any campaign → push within seconds.
- Client submits a payment → push.
- You approve/reject that payment → client gets a push.
- Ad guard pauses campaigns → both sides get a push.
- All work with the app fully closed on Android and installed-PWA iOS 16.4+.
