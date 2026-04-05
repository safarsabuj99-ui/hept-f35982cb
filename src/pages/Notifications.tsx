import { useState, useEffect, useRef, useCallback } from "react";
import { useNotifications, type Notification, type NotificationPriority } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Bell, Check, CheckCheck, Trash2, Shield, CreditCard, Megaphone,
  Settings2, AlertTriangle, Search, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";

const typeLabels: Record<string, string> = {
  payment: "Payment",
  guard: "Ad Guard",
  campaign: "Campaign",
  system: "System",
};

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

const priorityColors: Record<string, string> = {
  urgent: "bg-destructive/10 text-destructive border-destructive/30",
  high: "bg-warning/10 text-warning border-warning/30",
  normal: "",
  low: "",
};

const priorityBorder: Record<string, string> = {
  urgent: "border-l-[3px] border-l-destructive",
  high: "border-l-[3px] border-l-warning",
  normal: "",
  low: "",
};

function getDateGroup(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return "This Week";
  return "Earlier";
}

export default function Notifications() {
  const {
    notifications, unreadCount, loading, hasMore,
    markAsRead, markAllAsRead, deleteNotification,
    bulkDelete, bulkMarkRead, loadMore
  } = useNotifications();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<string>("all");
  const [readFilter, setReadFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const observerRef = useRef<HTMLDivElement>(null);

  // Infinite scroll
  useEffect(() => {
    if (!observerRef.current || !hasMore) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, { threshold: 0.5 });
    obs.observe(observerRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  const filtered = notifications.filter((n) => {
    if (filter !== "all" && n.type !== filter) return false;
    if (readFilter === "unread" && n.is_read) return false;
    if (readFilter === "read" && !n.is_read) return false;
    if (search) {
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
    }
    return true;
  });

  // Group by date
  const groups: Record<string, Notification[]> = {};
  for (const n of filtered) {
    const g = getDateGroup(n.created_at);
    (groups[g] ??= []).push(n);
  }
  const orderedGroups = ["Today", "Yesterday", "This Week", "Earlier"].filter((g) => groups[g]?.length);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((n) => n.id)));
    }
  };

  const handleClick = (notif: Notification) => {
    if (selected.size > 0) {
      toggleSelect(notif.id);
      return;
    }
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
    <div className="space-y-6 animate-slide-up-fade">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => { bulkMarkRead(Array.from(selected)); setSelected(new Set()); }}>
                <Check className="h-3.5 w-3.5" /> Mark read ({selected.size})
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive" onClick={() => { bulkDelete(Array.from(selected)); setSelected(new Set()); }}>
                <Trash2 className="h-3.5 w-3.5" /> Delete ({selected.size})
              </Button>
            </>
          )}
          {unreadCount > 0 && selected.size === 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={markAllAsRead}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {["all", "payment", "guard", "campaign", "system"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all" ? "All" : typeLabels[f]}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {["all", "unread", "read"].map((f) => (
            <button
              key={f}
              onClick={() => setReadFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize",
                readFilter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search notifications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Bulk select */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={selected.size === filtered.length && filtered.length > 0}
            onCheckedChange={selectAll}
          />
          <span className="text-xs text-muted-foreground">Select all ({filtered.length})</span>
        </div>
      )}

      {/* Notification Timeline */}
      {orderedGroups.length === 0 ? (
        <Card className="glass-card glow-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Bell className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs opacity-60 mt-1">You're all caught up</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {orderedGroups.map((group) => (
            <div key={group}>
              <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2 pl-1">{group}</h3>
              <div className="space-y-2">
                {groups[group].map((notif, i) => {
                  const Icon = typeIcons[notif.type] || Settings2;
                  return (
                    <Card
                      key={notif.id}
                      className={cn(
                        "glass-card cursor-pointer transition-all hover:shadow-md animate-slide-up-fade",
                        !notif.is_read && "glow-border bg-primary/5",
                        priorityBorder[notif.priority] || "",
                        selected.has(notif.id) && "ring-2 ring-primary/40"
                      )}
                      style={{ animationDelay: `${i * 30}ms` }}
                      onClick={() => handleClick(notif)}
                    >
                      <CardContent className="flex items-start gap-4 p-4">
                        <div className="flex items-center gap-3 shrink-0">
                          <Checkbox
                            checked={selected.has(notif.id)}
                            onCheckedChange={() => toggleSelect(notif.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className={cn("h-9 w-9 rounded-full flex items-center justify-center", typeColors[notif.type] || typeColors.system)}>
                            <Icon className="h-4 w-4" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={cn("text-sm", !notif.is_read && "font-semibold")}>{notif.title}</p>
                            {(notif.priority === "urgent" || notif.priority === "high") && (
                              <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5", priorityColors[notif.priority])}>
                                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                {notif.priority}
                              </Badge>
                            )}
                            <Badge variant="secondary" className={cn("text-[9px] h-4 px-1.5", typeColors[notif.type])}>
                              {typeLabels[notif.type] || notif.type}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{notif.body}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-2">
                            {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {!notif.is_read && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); markAsRead(notif.id); }}>
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
          {/* Infinite scroll sentinel */}
          {hasMore && (
            <div ref={observerRef} className="flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
