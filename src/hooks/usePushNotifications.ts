import { useEffect, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const VAPID_PUBLIC_KEY = "BApytxnwgrWgRXe4jlovIcb0-mDVXL8jxm1acUxrunW4ZgeK1z5TGUkuP682ald5mhsYKLePfQh0fwtydvQT9EM";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const { user, authReady } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isPreviewHost =
    hostname.includes("lovableproject.com") ||
    hostname.includes("id-preview--") ||
    hostname.includes("lovable.app");

  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    window.self === window.top &&
    !isPreviewHost;

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // On preview/iframe hosts, proactively unregister any stale SW that could
    // be causing reload loops, and skip registration entirely.
    if (isPreviewHost || window.self !== window.top) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister().catch(() => {}));
      }).catch(() => {});
      return;
    }
    if (!isSupported) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, [isSupported, isPreviewHost]);

  // Check existing subscription — gated on authReady
  useEffect(() => {
    if (!isSupported || !authReady || !user?.id) return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();

        if (sub) {
          const subJson = sub.toJSON();
          await supabase.from("push_subscriptions").upsert(
            {
              user_id: user.id,
              endpoint: sub.endpoint,
              keys_p256dh: subJson.keys?.p256dh ?? "",
              keys_auth: subJson.keys?.auth ?? "",
            },
            { onConflict: "user_id,endpoint" }
          );
          setIsSubscribed(true);
        } else if (Notification.permission === "granted") {
          const newSub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
          });
          const subJson = newSub.toJSON();
          await supabase.from("push_subscriptions").upsert(
            {
              user_id: user.id,
              endpoint: newSub.endpoint,
              keys_p256dh: subJson.keys?.p256dh ?? "",
              keys_auth: subJson.keys?.auth ?? "",
            },
            { onConflict: "user_id,endpoint" }
          );
          setIsSubscribed(true);
        }
      } catch (err) {
        console.error("Push auto-subscribe check failed:", err);
      }
    })();
  }, [isSupported, authReady, user?.id]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !user?.id) return false;
    setLoading(true);

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setLoading(false);
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
        });
      }

      const subJson = sub.toJSON();

      await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: sub.endpoint,
          keys_p256dh: subJson.keys?.p256dh ?? "",
          keys_auth: subJson.keys?.auth ?? "",
        },
        { onConflict: "user_id,endpoint" }
      );

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("Push subscription failed:", err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, user?.id]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !user?.id) return;
    setLoading(true);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", sub.endpoint)
          .eq("user_id", user.id);
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } finally {
      setLoading(false);
    }
  }, [isSupported, user?.id]);

  return { isSupported, permission, isSubscribed, loading, subscribe, unsubscribe };
}
