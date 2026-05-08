import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Pause, Play, AlertTriangle, Clock } from "lucide-react";

interface AuditRow {
  id: string;
  user_id: string;
  action_type: string;
  description: string | null;
  created_at: string;
}

const TYPES = [
  "ad_guard_pause",
  "ad_guard_resume",
  "ad_guard_critical_error",
  "ad_guard_window_expired",
];

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function rowMeta(action: string) {
  if (action === "ad_guard_resume") {
    return { icon: Play, cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", label: "Resumed" };
  }
  if (action === "ad_guard_pause") {
    return { icon: Pause, cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", label: "Paused" };
  }
  if (action === "ad_guard_window_expired") {
    return { icon: Clock, cls: "bg-muted text-muted-foreground", label: "Window expired" };
  }
  return { icon: AlertTriangle, cls: "bg-destructive/15 text-destructive", label: "Critical" };
}

export function AdGuardHistoryPanel({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("audit_logs")
      .select("id, user_id, action_type, description, created_at")
      .eq("user_id", userId)
      .in("action_type", TYPES)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);
    setRows((data as any) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchRows();
    const channel = supabase
      .channel(`ad-guard-history-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs", filter: `user_id=eq.${userId}` },
        (payload) => {
          const r = payload.new as AuditRow;
          if (TYPES.includes(r.action_type)) {
            setRows((prev) => [r, ...prev].slice(0, 50));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchRows]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Ad Guard History (24h)
          {rows.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px]">{rows.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-2">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No Ad Guard activity in the last 24 hours.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const meta = rowMeta(r.action_type);
              const Icon = meta.icon;
              return (
                <li key={r.id} className="flex items-start gap-3 rounded-md border p-2.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${meta.cls}`}>
                    <Icon className="h-3 w-3" /> {meta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">{r.description || r.action_type}</p>
                    <p className="text-[11px] text-muted-foreground" title={new Date(r.created_at).toLocaleString()}>
                      {formatRelative(r.created_at)} · {new Date(r.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
