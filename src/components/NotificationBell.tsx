import {
  Bell, Check, CheckCheck, Trash2, ExternalLink, BellRing, BellOff,
  Shield, CreditCard, Megaphone, Settings2, Volume2, VolumeX,
  AlertTriangle, ChevronDown
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useNotifications, type Notification, setNotifSoundEnabled } from "@/hooks/useNotifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";

const typeIcons: Record<string, React.ElementType> = {
  guard: Shield,
  payment: CreditCard,
  campaign: Megaphone,
  system: Settings2,
};

const typeColors: Record<string, string> = {
  payment: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  guard: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  campaign: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
  system: "text-muted-foreground bg-muted",
};

const priorityBorder: Record<string, string> = {
  urgent: "border-l-[3px] border-l-destructive",
  high: "border-l-[3px] border-l-warning",
  normal: "",
  low: "",
};

interface NotificationBellProps {
  allNotificationsPath?: string;
}

export function NotificationBell({ allNotificationsPath = "/admin/notifications" }: NotificationBellProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const { isSupported, isSubscribed, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "urgent">("all");
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("notif_sound_enabled") !== "false");

  // Touch handling for swipe-to-dismiss
  const touchStartX = useRef(0);
  const [swipingId, setSwipingId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const handleTouchStart = useCallback((id: string, e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setSwipingId(id);
    setSwipeOffset(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipingId) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (dx < 0) setSwipeOffset(dx);
  }, [swipingId]);

  const handleTouchEnd = useCallback(() => {
    if (swipingId && swipeOffset < -80) {
      deleteNotification(swipingId);
    }
    setSwipingId(null);
    setSwipeOffset(0);
  }, [swipingId, swipeOffset, deleteNotification]);

  const handleTogglePush = async () => {
    if (isSubscribed) {
      await unsubscribe();
      toast.success("Push notifications disabled");
    } else {
      const ok = await subscribe();
      if (ok) toast.success("Push notifications enabled!");
      else toast.error("Could not enable push notifications");
    }
  };

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setNotifSoundEnabled(next);
    toast.success(next ? "Sound enabled" : "Sound muted");
  };

  const handleClick = (notif: Notification) => {
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.link) {
      setOpen(false);
      navigate(notif.link);
    }
  };

  // Group notifications by group_key
  const grouped = groupNotifications(notifications);

  const filtered = grouped.filter((item) => {
    if (filter === "unread") return !item.is_read;
    if (filter === "urgent") return item.priority === "urgent" || item.priority === "high";
    return true;
  });

  const urgentCount = notifications.filter((n) => !n.is_read && (n.priority === "urgent" || n.priority === "high")).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-lg press-effect">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className={cn(
              "absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-destructive-foreground animate-in zoom-in-50",
              urgentCount > 0 ? "bg-destructive notif-urgent-badge" : "bg-primary"
            )}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 md:w-[420px] p-0 glass-card" sideOffset={8}>
        {/* Header */}
        <div className="border-b px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Notifications</h4>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleToggleSound}>
                {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
              </Button>
              {isSupported && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleTogglePush} disabled={pushLoading}>
                  {isSubscribed ? <BellOff className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
                </Button>
              )}
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 ml-1" onClick={markAllAsRead}>
                  <CheckCheck className="h-3 w-3" /> All read
                </Button>
              )}
            </div>
          </div>
          {/* Filter tabs */}
          <div className="flex gap-1">
            {(["all", "unread", "urgent"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                {f === "all" ? "All" : f === "unread" ? `Unread (${unreadCount})` : `Urgent (${urgentCount})`}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <ScrollArea className="max-h-[400px]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Bell className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">All caught up!</p>
              <p className="text-xs opacity-60 mt-1">No {filter !== "all" ? filter : ""} notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.slice(0, 25).map((item) => {
                if (item._isGroup) {
                  return <GroupedNotificationItem key={item._groupKey} item={item} onItemClick={handleClick} onMarkRead={markAsRead} onDelete={deleteNotification} />;
                }
                const Icon = typeIcons[item.type] || Settings2;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-accent/50",
                      !item.is_read && "bg-primary/5",
                      priorityBorder[item.priority] || ""
                    )}
                    style={swipingId === item.id ? { transform: `translateX(${swipeOffset}px)`, transition: "none" } : undefined}
                    onClick={() => handleClick(item)}
                    onTouchStart={(e) => handleTouchStart(item.id, e)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  >
                    <div className={cn("mt-0.5 shrink-0 h-7 w-7 rounded-full flex items-center justify-center", typeColors[item.type] || typeColors.system)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={cn("text-sm truncate", !item.is_read && "font-semibold")}>{item.title}</p>
                        {(item.priority === "urgent" || item.priority === "high") && (
                          <AlertTriangle className={cn("h-3 w-3 shrink-0", item.priority === "urgent" ? "text-destructive" : "text-warning")} />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{item.body}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {!item.is_read && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); markAsRead(item.id); }}>
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteNotification(item.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <Button variant="ghost" size="sm" className="w-full text-xs gap-1" onClick={() => { setOpen(false); navigate(allNotificationsPath); }}>
              <ExternalLink className="h-3 w-3" /> View all notifications
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// --- Grouping logic ---

interface GroupedItem extends Notification {
  _isGroup?: boolean;
  _groupKey?: string;
  _children?: Notification[];
  _count?: number;
}

function groupNotifications(notifs: Notification[]): GroupedItem[] {
  const groups: Record<string, Notification[]> = {};
  const standalone: GroupedItem[] = [];

  for (const n of notifs) {
    if (n.group_key) {
      (groups[n.group_key] ??= []).push(n);
    } else {
      standalone.push(n);
    }
  }

  const result: GroupedItem[] = [];
  for (const [key, items] of Object.entries(groups)) {
    if (items.length >= 3) {
      const latest = items[0];
      result.push({
        ...latest,
        _isGroup: true,
        _groupKey: key,
        _children: items,
        _count: items.length,
        is_read: items.every((i) => i.is_read),
      });
    } else {
      result.push(...items);
    }
  }
  result.push(...standalone);
  result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return result;
}

function GroupedNotificationItem({ item, onItemClick, onMarkRead, onDelete }: {
  item: GroupedItem;
  onItemClick: (n: Notification) => void;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = typeIcons[item.type] || Settings2;

  return (
    <div className={cn("border-b", priorityBorder[item.priority] || "")}>
      <div
        className={cn("flex gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-accent/50", !item.is_read && "bg-primary/5")}
        onClick={() => setExpanded(!expanded)}
      >
        <div className={cn("mt-0.5 shrink-0 h-7 w-7 rounded-full flex items-center justify-center", typeColors[item.type] || typeColors.system)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm", !item.is_read && "font-semibold")}>{item._count} related notifications</p>
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.title}</p>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </div>
      {expanded && item._children?.map((child) => {
        const ChildIcon = typeIcons[child.type] || Settings2;
        return (
          <div
            key={child.id}
            className={cn("flex gap-3 pl-8 pr-4 py-2 cursor-pointer hover:bg-accent/30 text-sm", !child.is_read && "bg-primary/5")}
            onClick={() => onItemClick(child)}
          >
            <ChildIcon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", typeColors[child.type]?.split(" ")[0])} />
            <div className="flex-1 min-w-0">
              <p className={cn("text-xs truncate", !child.is_read && "font-semibold")}>{child.title}</p>
              <p className="text-[10px] text-muted-foreground/60">{formatDistanceToNow(new Date(child.created_at), { addSuffix: true })}</p>
            </div>
            <div className="flex gap-0.5 shrink-0">
              {!child.is_read && (
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); onMarkRead(child.id); }}>
                  <Check className="h-2.5 w-2.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(child.id); }}>
                <Trash2 className="h-2.5 w-2.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
