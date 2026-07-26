// Service Worker for Web Push Notifications
// v4 — pushsubscriptionchange auto-recovery + absolute-URL click nav
// Does NOT cache anything — purely for push notification handling

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const existing = await self.registration.active;
    if (!existing) {
      await self.skipWaiting();
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const anyUncontrolled = clientList.some((c) => !c.frameType || c.frameType === "top-level");
    const alreadyControlled = clientList.some((c) => c.type === "window" && self.registration.active && c.url);
    if (!alreadyControlled || clientList.length === 0) {
      try { await self.clients.claim(); } catch {}
    }
    if (!anyUncontrolled) return;
  })());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "New Notification", body: event.data.text() };
  }

  const isUrgent = data.tag === "guard" || data.priority === "urgent" || data.priority === "high";
  const uniqueTag = (data.tag || "hept") + "-" + Date.now();

  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: uniqueTag,
    data: { link: data.link || "/" },
    vibrate: [200, 100, 200],
    renotify: true,
    requireInteraction: isUrgent,
    actions: [
      { action: "view", title: "View" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title || "HEPT", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const rawLink = event.notification.data?.link || "/";
  // Resolve relative paths ("/admin/...") to an absolute URL scoped to this SW origin
  const absLink = new URL(rawLink, self.location.origin).href;

  event.waitUntil((async () => {
    const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windowClients) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        try { await client.navigate(absLink); } catch {}
        return client.focus();
      }
    }
    return clients.openWindow(absLink);
  })());
});

// Auto-recover a dropped/rotated subscription. Chrome/Android sometimes replaces
// the endpoint silently; without this handler our stored push_subscriptions row
// would be dead and no future push would ever land on the device.
const VAPID_PUBLIC_KEY_B64 = "BApytxnwgrWgRXe4jlovIcb0-mDVXL8jxm1acUxrunW4ZgeK1z5TGUkuP682ald5mhsYKLePfQh0fwtydvQT9EM";
function b64UrlToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      const applicationServerKey = event.oldSubscription?.options?.applicationServerKey
        || b64UrlToBytes(VAPID_PUBLIC_KEY_B64).buffer;
      const newSub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const subJson = newSub.toJSON();
      await fetch("/functions/v1/refresh-push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          old_endpoint: event.oldSubscription?.endpoint || null,
          endpoint: newSub.endpoint,
          keys_p256dh: subJson.keys?.p256dh ?? "",
          keys_auth: subJson.keys?.auth ?? "",
        }),
      }).catch(() => {});
    } catch (err) {
      // swallow — next foreground mount will re-subscribe via the hook
    }
  })());
});
