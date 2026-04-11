

## Fix: Push Notifications When Browser is Closed

**Problem:** Push notifications only work when the browser/app is open. They should arrive even when the browser is completely closed on both mobile and desktop.

**Root causes identified:**

1. **Missing `gcm_sender_id` in manifest.json** — Chrome and Android require this standard value (`103953800507`) in the web app manifest to route push messages through Google's push service when the browser is closed
2. **Missing `Urgency` header** — Without `Urgency: high`, push services (especially on mobile) may defer or drop notifications during battery-saving/doze mode
3. **Notification tag collapsing** — All notifications of the same type share one tag, so new notifications silently replace previous ones instead of stacking
4. **No automatic push subscription on login** — Users must manually click "Enable Push" in the bell menu; most users never discover this, so they never get push notifications at all
5. **Service worker not using `skipWaiting` / `clients.claim`** — New SW versions may sit idle waiting for activation, causing missed push events

---

### Changes

**1. `public/manifest.json`** — Add `gcm_sender_id`
- Add `"gcm_sender_id": "103953800507"` (required by Chrome/Android for background push delivery)

**2. `public/sw.js`** — Improve reliability
- Add `install` → `self.skipWaiting()` and `activate` → `clients.claim()` so the SW activates immediately
- Make each notification tag unique by appending a timestamp, preventing silent replacement
- Add `requireInteraction: true` for urgent notifications so they persist until tapped
- Add `actions` buttons (e.g., "View" / "Dismiss") for richer mobile experience

**3. `supabase/functions/send-push/index.ts`** — Add `Urgency: high` header
- Add the `Urgency: high` HTTP header to push requests so mobile OS treats them as high-priority and delivers immediately even in doze/battery-saver mode

**4. `src/hooks/usePushNotifications.ts`** — Auto-subscribe on login
- After user logs in and permission is already `"granted"`, automatically re-subscribe (ensures subscription persists across devices/sessions without requiring manual opt-in each time)
- Add subscription refresh logic: if existing subscription endpoint differs from DB, update it

**5. `src/components/NotificationBell.tsx`** — Auto-prompt for new users
- On first visit (no prior permission decision), show a subtle inline prompt "Enable notifications to stay updated" instead of requiring users to find the push toggle

---

### How it works after the fix

```text
Notification created in DB
  → DB trigger fires send-push edge function
    → Edge function sends with Urgency: high + unique tag
      → Push service (FCM/Mozilla) delivers to device
        → SW wakes up (even if browser closed)
          → Native OS notification shown
            → Tap opens app to deep-link
```

### Files changed
- `public/manifest.json` — add gcm_sender_id
- `public/sw.js` — skipWaiting, claim, unique tags, actions
- `supabase/functions/send-push/index.ts` — Urgency header
- `src/hooks/usePushNotifications.ts` — auto-resubscribe on login
- `src/components/NotificationBell.tsx` — inline push prompt for new users

