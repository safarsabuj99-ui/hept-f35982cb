## Why push doesn't arrive (root cause)

Push is fully wired end-to-end on the server side — `notifications` insert → DB trigger `on_notification_send_push` → `pg_net` POST to the `send-push` edge function → web-push to the subscriber. The piece that's broken is on the **client**:

```text
src/lib/previewEnv.ts → isLovablePreviewHost()
  host.endsWith(".lovable.app")  ← TRUE for the published app
```

The published app lives at `hept.lovable.app`, which ends with `.lovable.app`. That makes `isPreviewEnv()` return `true` on the real published site, which causes:

- `src/main.tsx` to **aggressively unregister every service worker** on every load
- `src/hooks/usePushNotifications.ts` to **skip registering `/sw.js`** entirely
- The manifest link to be skipped

Result: the SW that delivers push when the app is closed is torn down on every visit. The browser has no worker to wake, so no notification ever arrives — even with the app open, because the subscription is wiped too.

The custom domains (`heptbd.com`, `www.heptbd.com`) are not affected by the host check, but they hit the same code path because the preview iframe check is fine — the bug is purely the `.lovable.app` suffix.

## The fix

### 1. Tighten preview-host detection (`src/lib/previewEnv.ts`)

Only treat actual Lovable preview hosts as preview. The real published `*.lovable.app` (one DNS label before `.lovable.app`, no `id-preview--` / `preview--` prefix) is production.

```text
preview hosts (keep tearing SW down):
  *.lovableproject.com
  *.lovableproject-dev.com
  id-preview--*.lovable.app
  preview--*.lovable.app
  *.beta.lovable.dev

published hosts (register SW, enable push):
  hept.lovable.app
  heptbd.com / www.heptbd.com
  any other custom domain
```

This matches the rule the PWA skill uses verbatim.

### 2. Add a "Send test push" button in Settings → Notifications

So the user can verify the full pipeline (subscription → edge function → SW → OS notification) with one click, including when the tab is closed (5-second delay test option).

- New small button row at the top of `NotificationsTab.tsx`: **Send test push**.
- Calls `supabase.functions.invoke("send-push", { body: { user_id, title: "Test from HEPT", body: "...", type: "system", priority: "high" } })`.
- Shows result toast: "Sent to N device(s)" or "0 — please enable notifications first".
- Second helper button: **Re-subscribe this device** (unsubscribes + subscribes again — fixes stale endpoints without clearing browser data).

### 3. iOS install hint

iOS Safari only delivers web push when the PWA is installed to the Home Screen. Add a one-line hint inside the Notifications tab when the device looks like iOS Safari and `Notification.permission !== 'granted'`:

> "On iPhone, you must add HEPT to your Home Screen (Share → Add to Home Screen), then open it from the icon and tap Allow."

### 4. No SW or backend changes needed

`public/sw.js`, `send-push`, the DB trigger, and `usePushNotifications` are all correct. They simply weren't running on the published host.

## What the user will see after the fix

1. Open `hept.lovable.app` (or `heptbd.com`) → service worker registers silently.
2. First visit prompts (or Settings → Notifications) → tap Allow → subscription saved.
3. Close the tab / quit the PWA.
4. Any event that inserts a row in `notifications` fires the OS notification on the locked device.
5. The new **Send test push** button proves it in one click.

## Files changed

- `src/lib/previewEnv.ts` — restrict preview host matcher.
- `src/components/settings/NotificationsTab.tsx` — add Send test push + Re-subscribe buttons and iOS hint.

No database migration, no edge-function change, no SW change.

## Verification

- On `hept.lovable.app`: DevTools → Application → Service Workers shows `/sw.js` **activated** (today it's empty).
- Settings → Notifications → **Send test push** → OS notification appears.
- Close all tabs, send another test push from a second device or via Admin → notification appears on lock screen.
- On preview (`id-preview--…lovable.app`): SW is still torn down — preview reload-loop guard preserved.