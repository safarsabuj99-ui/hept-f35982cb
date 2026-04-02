import { Bell, Check, CheckCheck, Trash2, ExternalLink, BellRing, BellOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

const typeColors: Record<string, string> = {
  payment: "bg-emerald-500",
  guard: "bg-amber-500",
  campaign: "bg-blue-500",
  system: "bg-muted-foreground",
};

interface NotificationBellProps {
  allNotificationsPath?: string;
}

export function NotificationBell({ allNotificationsPath = "/admin/notifications" }: NotificationBellProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const { isSupported, isSubscribed, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

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

  const handleClick = (notif: Notification) => {
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.link) {
      setOpen(false);
      navigate(notif.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-lg press-effect">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground animate-in zoom-in-50">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 md:w-96 p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold">Notifications</h4>
          <div className="flex items-center gap-1">
            {isSupported && (
              <Button
                variant="ghost" size="sm" className="h-7 text-xs gap-1"
                onClick={handleTogglePush} disabled={pushLoading}
              >
                {isSubscribed ? <BellOff className="h-3 w-3" /> : <BellRing className="h-3 w-3" />}
                {isSubscribed ? "Mute" : "Push"}
              </Button>
            )}
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={markAllAsRead}>
                <CheckCheck className="h-3 w-3" /> Mark all read
              </Button>
            )}
          </div>
        </div>

        {/* List */}
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.slice(0, 20).map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    "flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-accent/50",
                    !notif.is_read && "bg-primary/5"
                  )}
                  onClick={() => handleClick(notif)}
                >
                  {/* Type dot */}
                  <div className="pt-1.5 shrink-0">
                    <div className={cn("h-2 w-2 rounded-full", typeColors[notif.type] || typeColors.system)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm truncate", !notif.is_read && "font-semibold")}>{notif.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{notif.body}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {!notif.is_read && (
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); markAsRead(notif.id); }}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <Button
              variant="ghost" size="sm" className="w-full text-xs gap-1"
              onClick={() => { setOpen(false); navigate(allNotificationsPath); }}
            >
              <ExternalLink className="h-3 w-3" /> View all notifications
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
