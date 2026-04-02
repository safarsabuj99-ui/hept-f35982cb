

## Web Push Notifications for AdSpend

### What You'll Get
Real browser push notifications that pop up on users' devices — even when the app tab is closed. When a new notification is created (payment, guard alert, campaign update), users will receive a native OS-level push notification in addition to the existing in-app bell/toast.

### Compatibility
- **Android + Chrome/Edge/Brave**: Full support, works in background
- **macOS + Chrome/Edge/Firefox**: Full support
- **Windows + Chrome/Edge**: Full support
- **iOS Safari (PWA only)**: Supported since iOS 16.4, but only when installed as PWA

---

### Changes

**1. Generate VAPID keys (secret)**
- Web Push requires a VAPID key pair (public + private). We'll generate these and store the private key as a backend secret (`VAPID_PRIVATE_KEY`), and embed the public key in the frontend code.
- You'll need to provide the VAPID keys (I'll give you a generation command) or I can generate them via an edge function.

**2. Create `push_subscriptions` table (migration)**
- Stores each user's push subscription (endpoint, keys) so the backend knows where to send pushes.
- Columns: `id`, `user_id`, `endpoint`, `keys_p256dh`, `keys_auth`, `created_at`
- RLS: users can only manage their own subscriptions

**3. Create service worker (`public/sw.js`)**
- Minimal service worker that listens for `push` events and displays native notifications
- Handles notification click to open the app at the correct link
- Will NOT cache anything or interfere with navigation (no workbox/PWA caching)

**4. Add push subscription logic (`src/hooks/usePushNotifications.ts`)**
- On login, requests notification permission from the browser
- Subscribes to push using the VAPID public key
- Saves the subscription to the `push_subscriptions` table
- Registers the service worker (with iframe/preview guards so it doesn't break the editor)

**5. Create `send-push` edge function**
- Triggered from a database webhook (or called by existing notification triggers)
- When a row is inserted into `notifications`, this function:
  - Looks up the user's push subscriptions
  - Sends a Web Push message using the `web-push` protocol
  - Removes stale/expired subscriptions automatically

**6. Add database webhook on `notifications` INSERT**
- Fires the `send-push` edge function whenever a notification is created, so every existing notification trigger automatically sends a push too

**7. Integrate subscription prompt in the UI**
- Add a subtle "Enable push notifications" prompt in the notification bell dropdown or settings page
- Show subscription status (enabled/disabled)

### Technical Details

```text
┌──────────────┐    INSERT    ┌──────────────┐   webhook   ┌─────────────┐
│  DB Trigger   │ ──────────► │ notifications │ ──────────► │ send-push   │
│ (existing)    │             │   table       │             │ edge fn     │
└──────────────┘             └──────────────┘             └──────┬──────┘
                                                                  │
                                                    Web Push API  │
                                                                  ▼
                                                         ┌──────────────┐
                                                         │ Browser/OS   │
                                                         │ Notification │
                                                         └──────────────┘
```

- No third-party push service needed — Web Push is a free W3C standard
- The `web-push` npm library handles the encryption protocol in the edge function
- Existing notification triggers (payment, guard, campaign) will automatically send pushes with zero changes

