import { useState, useEffect, useRef } from "react";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MobileSearchPill } from "@/components/ui/mobile-search-pill";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Bell, Check, CheckCheck, Trash2, Shield, CreditCard, Megaphone,
  Settings2, AlertTriangle, Search, X, Pin, Clock, Archive, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

const typeLabels: Record<string, string> = {
  payment: "Payment", guard: "Ad Guard", campaign: "Campaign", system: "System",
};

const typeIcons: Record<string, React.ElementType> = {
  guard: Shield, payment: CreditCard, campaign: Megaphone, system: Settings2,
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
  normal: "", low: "",
};

const priorityBorder: Record<string, string> = {
  urgent: "border-l-[3px] border-l-destructive",
  high: "border-l-[3px] border-l-warning",
  normal: "", low: "",
};

type SectionKey = "pinned" | "action" | "today" | "snoozed" | "earlier";

function bucketize(all: Notification[]): Record<SectionKey, Notification[]> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const buckets: Record<SectionKey, Notification[]> = {
    pinned: [], action: [], today: [], snoozed: [], earlier: [],
  };
  for (const n of all) {
    if (n.snoozed_until && new Date(n.snoozed_until) > new Date()) {
      buckets.snoozed.push(n); continue;
    }
    if (n.is_pinned) { buckets.pinned.push(n); continue; }
    if (!n.is_read && (n.priority === "urgent" || n.priority === "high")) {
      buckets.action.push(n); continue;
    }
    if (new Date(n.created_at) >= today) buckets.today.push(n);
    else buckets.earlier.push(n);
  }
  return buckets;
}

export default function Notifications() {
  const {
    allNotifications, unreadCount, loading, hasMore,
    markAsRead, markAllAsRead, deleteNotification,
    bulkDelete, bulkMarkRead, loadMore,
    snoozeNotification, togglePin, archiveNotification,
  } = useNotifications();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const observerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!observerRef.current || !hasMore) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, { threshold: 0.5 });
    obs.observe(observerRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  const filtered = allNotifications.filter((n) => {
    if (filter !== "all" && n.type !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
    }
    return true;
  });

  const buckets = bucketize(filtered);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleClick = (notif: Notification) => {
    if (selected.size > 0) { toggleSelect(notif.id); return; }
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

  const sectionConfig: { key: SectionKey; title: string; icon: React.ElementType; accent: string; sticky?: boolean }[] = [
    { key: "pinned", title: "Pinned", icon: Pin, accent: "text-warning", sticky: true },
    { key: "action", title: "Action Required", icon: AlertTriangle, accent: "text-destructive" },
    { key: "today", title: "Today", icon: Sparkles, accent: "text-primary" },
    { key: "snoozed", title: "Snoozed", icon: Clock, accent: "text-muted-foreground" },
    { key: "earlier", title: "Earlier", icon: Archive, accent: "text-muted-foreground" },
  ];

  const totalShown = sectionConfig.reduce((sum, s) => sum + buckets[s.key].length, 0);

  return (
    <div className="space-y-6 animate-slide-up-fade">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Inbox</h1>
          <p className="text-sm text-muted-foreground">{unreadCount} unread · {totalShown} total</p>
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
        <MobileSearchPill
          value={search}
          onChange={setSearch}
          placeholder="Search notifications..."
          className="flex-1 min-w-[200px]"
          inputClassName="h-9 text-sm"
          label="Search notifications"
        />
      </div>

      {/* Sections */}
      {totalShown === 0 ? (
        <Card className="glass-card glow-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Bell className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs opacity-60 mt-1">You're all caught up</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {sectionConfig.map((sec) => {
            const items = buckets[sec.key];
            if (items.length === 0) return null;
            const Icon = sec.icon;
            return (
              <div key={sec.key} className={cn(sec.sticky && "sticky top-2 z-10")}>
                <div className="flex items-center gap-2 mb-3 pl-1">
                  <Icon className={cn("h-4 w-4", sec.accent)} />
                  <h3 className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground">{sec.title}</h3>
                  <Badge variant="secondary" className="h-4 text-[10px] px-1.5">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map((notif, i) => (
                    <NotifCard
                      key={notif.id}
                      notif={notif}
                      isSelected={selected.has(notif.id)}
                      onSelect={toggleSelect}
                      onClick={handleClick}
                      onMarkRead={markAsRead}
                      onDelete={deleteNotification}
                      onPin={togglePin}
                      onSnooze={snoozeNotification}
                      onArchive={archiveNotification}
                      animationDelay={i * 30}
                      sectionKey={sec.key}
                    />
                  ))}
                </div>
              </div>
            );
          })}
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

function NotifCard({
  notif, isSelected, onSelect, onClick, onMarkRead, onDelete, onPin, onSnooze, onArchive, animationDelay, sectionKey
}: {
  notif: Notification;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onClick: (n: Notification) => void;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onSnooze: (id: string, hours: number) => void;
  onArchive: (id: string) => void;
  animationDelay: number;
  sectionKey: SectionKey;
}) {
  const Icon = typeIcons[notif.type] || Settings2;
  const snoozeRemaining = notif.snoozed_until ? formatDistanceToNow(new Date(notif.snoozed_until), { addSuffix: false }) : null;

  return (
    <Card
      className={cn(
        "glass-card cursor-pointer transition-all hover:shadow-md animate-slide-up-fade group",
        !notif.is_read && "glow-border bg-primary/5",
        notif.is_pinned && "bg-warning/5",
        priorityBorder[notif.priority] || "",
        isSelected && "ring-2 ring-primary/40"
      )}
      style={{ animationDelay: `${animationDelay}ms` }}
      onClick={() => onClick(notif)}
    >
      <CardContent className="flex items-start gap-4 p-4">
        <div className="flex items-center gap-3 shrink-0">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onSelect(notif.id)}
            onClick={(e) => e.stopPropagation()}
          />
          <div className={cn("h-9 w-9 rounded-full flex items-center justify-center", typeColors[notif.type] || typeColors.system)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {notif.is_pinned && <Pin className="h-3 w-3 text-warning fill-warning" />}
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
            {sectionKey === "snoozed" && snoozeRemaining && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-1">
                <Clock className="h-2.5 w-2.5" /> {snoozeRemaining}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{notif.body}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-2">
            {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
          </p>
        </div>
        <div className="flex gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onPin(notif.id); }} title={notif.is_pinned ? "Unpin" : "Pin"}>
            <Pin className={cn("h-3.5 w-3.5", notif.is_pinned && "fill-warning text-warning")} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()} title="Snooze">
                <Clock className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuLabel className="text-[11px]">Snooze for</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onSnooze(notif.id, 1)}>1 hour</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze(notif.id, 4)}>4 hours</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze(notif.id, 24)}>Until tomorrow</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onArchive(notif.id)}>
                <Archive className="h-3.5 w-3.5 mr-2" /> Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!notif.is_read && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onMarkRead(notif.id); }}>
              <Check className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(notif.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
