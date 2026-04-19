import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: "payment" | "guard" | "campaign" | "system";
  priority: NotificationPriority;
  group_key: string | null;
  is_read: boolean;
  link: string | null;
  created_at: string;
  snoozed_until?: string | null;
  is_pinned?: boolean;
  archived_at?: string | null;
}

const NOTIFICATION_SOUND_KEY = "notif_sound_enabled";

function getNotifSoundEnabled(): boolean {
  return localStorage.getItem(NOTIFICATION_SOUND_KEY) !== "false";
}

export function setNotifSoundEnabled(v: boolean) {
  localStorage.setItem(NOTIFICATION_SOUND_KEY, v ? "true" : "false");
}

function playNotifSound() {
  if (!getNotifSoundEnabled()) return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

function vibrate() {
  try { navigator.vibrate?.([100, 50, 100]); } catch {}
}

export function useNotifications() {
  const { user, authReady } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);
  const PAGE_SIZE = 20;

  const fetchNotifications = useCallback(async (reset = true) => {
    if (!user?.id) return;
    const page = reset ? 0 : pageRef.current;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data) {
      const typed = data as unknown as Notification[];
      if (reset) {
        setNotifications(typed);
        pageRef.current = 1;
      } else {
        setNotifications((prev) => [...prev, ...typed]);
        pageRef.current = page + 1;
      }
      setHasMore(typed.length === PAGE_SIZE);
      if (reset) {
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_read", false)
          .is("archived_at", null);
        setUnreadCount(count ?? 0);
      }
    }
    setLoading(false);
  }, [user?.id]);

  const loadMore = useCallback(() => {
    if (hasMore) fetchNotifications(false);
  }, [hasMore, fetchNotifications]);

  useEffect(() => {
    if (!authReady || !user?.id) {
      if (authReady) {
        setNotifications([]);
        setUnreadCount(0);
        setLoading(false);
      }
      return;
    }
    fetchNotifications();
  }, [authReady, user?.id, fetchNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!authReady || !user?.id) return;

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newNotif = payload.new as unknown as Notification;
          setNotifications((prev) => [newNotif, ...prev]);
          setUnreadCount((prev) => prev + 1);

          const priority = newNotif.priority || "normal";

          if (priority === "urgent") {
            toast.error(newNotif.title, {
              description: newNotif.body,
              duration: 10000,
              action: newNotif.link ? {
                label: "View Now",
                onClick: () => window.dispatchEvent(new CustomEvent("notif-navigate", { detail: newNotif.link })),
              } : undefined,
            });
            playNotifSound();
            vibrate();
          } else if (priority === "high") {
            toast.warning(newNotif.title, {
              description: newNotif.body,
              duration: 6000,
              action: newNotif.link ? {
                label: "View",
                onClick: () => window.dispatchEvent(new CustomEvent("notif-navigate", { detail: newNotif.link })),
              } : undefined,
            });
            playNotifSound();
          } else if (priority === "low") {
            toast.info(newNotif.title, { description: newNotif.body, duration: 3000 });
          } else {
            toast.success(newNotif.title, { description: newNotif.body, duration: 4000 });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [authReady, user?.id]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ is_read: true } as any).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;
    await supabase
      .from("notifications")
      .update({ is_read: true } as any)
      .eq("user_id", user.id)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [user?.id]);

  const deleteNotification = useCallback(async (id: string) => {
    const notif = notifications.find((n) => n.id === id);
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (notif && !notif.is_read) setUnreadCount((prev) => Math.max(0, prev - 1));
  }, [notifications]);

  const bulkDelete = useCallback(async (ids: string[]) => {
    await supabase.from("notifications").delete().in("id", ids);
    const unreadDeleted = notifications.filter((n) => ids.includes(n.id) && !n.is_read).length;
    setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
    setUnreadCount((prev) => Math.max(0, prev - unreadDeleted));
  }, [notifications]);

  const bulkMarkRead = useCallback(async (ids: string[]) => {
    await supabase.from("notifications").update({ is_read: true } as any).in("id", ids);
    const unreadMarked = notifications.filter((n) => ids.includes(n.id) && !n.is_read).length;
    setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - unreadMarked));
  }, [notifications]);

  // ===== v2 lifecycle actions =====
  const snoozeNotification = useCallback(async (id: string, hours: number) => {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    await (supabase.from("notifications") as any).update({ snoozed_until: until }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, snoozed_until: until } : n)));
    toast.success(`Snoozed for ${hours < 24 ? `${hours}h` : "1 day"}`);
  }, []);

  const togglePin = useCallback(async (id: string) => {
    const notif = notifications.find((n) => n.id === id);
    if (!notif) return;
    const next = !notif.is_pinned;
    await (supabase.from("notifications") as any).update({ is_pinned: next }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_pinned: next } : n)));
    toast.success(next ? "Pinned" : "Unpinned");
  }, [notifications]);

  const archiveNotification = useCallback(async (id: string) => {
    const notif = notifications.find((n) => n.id === id);
    await (supabase.from("notifications") as any).update({ archived_at: new Date().toISOString() }).eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (notif && !notif.is_read) setUnreadCount((prev) => Math.max(0, prev - 1));
  }, [notifications]);

  const muteGroup = useCallback(async (groupKey: string, hours: number) => {
    if (!user?.id) return;
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    await (supabase.from("notification_mutes") as any).upsert(
      { user_id: user.id, group_key: groupKey, muted_until: until },
      { onConflict: "user_id,group_key" }
    );
    toast.success(`Muted similar alerts for ${hours}h`);
  }, [user?.id]);

  // Bell-list filter: hide currently snoozed items
  const visibleNotifications = notifications.filter(
    (n) => !n.snoozed_until || new Date(n.snoozed_until) <= new Date()
  );

  return {
    notifications: visibleNotifications,
    allNotifications: notifications,
    unreadCount,
    loading,
    hasMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    bulkDelete,
    bulkMarkRead,
    loadMore,
    snoozeNotification,
    togglePin,
    archiveNotification,
    muteGroup,
    refetch: fetchNotifications,
  };
}

export function useNotificationNavigator() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e: Event) => {
      const link = (e as CustomEvent).detail;
      if (link) navigate(link);
    };
    window.addEventListener("notif-navigate", handler);
    return () => window.removeEventListener("notif-navigate", handler);
  }, [navigate]);
}
