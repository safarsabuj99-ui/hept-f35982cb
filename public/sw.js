// Service Worker for Web Push Notifications
// v3 — reload-loop fix: no aggressive skipWaiting/claim on already-controlled pages
// Does NOT cache anything — purely for push notification handling

self.addEventListener("install", (event) => {
  // Only skip waiting on the very first install (no existing controller).
  // On subsequent installs we let the new SW wait until all tabs close,
  // which prevents activation races that look like full-page reloads.
  event.waitUntil((async () => {
    const existing = await self.registration.active;
    if (!existing) {
      await self.skipWaiting();
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Only claim uncontrolled clients (first ever activation).
    // Claiming already-controlled tabs is what triggers the reload flash on
    // some browsers / installed PWAs.
    const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const anyUncontrolled = clientList.some((c) => !c.frameType || c.frameType === "top-level");
    const alreadyControlled = clientList.some((c) => (c).type === "window" && self.registration.active && (c).url);
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

  const link = event.notification.data?.link || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return clients.openWindow(link);
    })
  );
});
