import { useState } from "react";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Check, CheckCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const typeLabels: Record<string, string> = {
  payment: "Payment",
  guard: "Ad Guard",
  campaign: "Campaign",
  system: "System",
};

const typeColors: Record<string, string> = {
  payment: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  guard: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  campaign: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  system: "bg-muted text-muted-foreground",
};

export default function Notifications() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>("all");
  const [readFilter, setReadFilter] = useState<string>("all");

  const filtered = notifications.filter((n) => {
    if (filter !== "all" && n.type !== filter) return false;
    if (readFilter === "unread" && n.is_read) return false;
    if (readFilter === "read" && !n.is_read) return false;
    return true;
  });

  const handleClick = (notif: Notification) => {
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.link) navigate(notif.link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={markAllAsRead}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="payment">Payment</TabsTrigger>
            <TabsTrigger value="guard">Guard</TabsTrigger>
            <TabsTrigger value="campaign">Campaign</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={readFilter} onValueChange={setReadFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
            <TabsTrigger value="read">Read</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Notification list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Bell className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm">No notifications</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((notif) => (
            <Card
              key={notif.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                !notif.is_read && "border-primary/30 bg-primary/5"
              )}
              onClick={() => handleClick(notif)}
            >
              <CardContent className="flex items-start gap-4 p-4">
                <div className="pt-0.5 shrink-0">
                  <Badge variant="secondary" className={cn("text-[10px] font-medium", typeColors[notif.type])}>
                    {typeLabels[notif.type] || notif.type}
                  </Badge>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm", !notif.is_read && "font-semibold")}>{notif.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{notif.body}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-2">
                    {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {!notif.is_read && (
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); markAsRead(notif.id); }}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
