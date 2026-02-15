import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowUpCircle, ArrowDownCircle, RefreshCw } from "lucide-react";

interface Activity {
  id: string;
  type: "credit" | "debit" | "sync";
  description: string;
  amount?: number;
  time: string;
  status?: string;
}

export function RecentActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [txnRes, syncRes] = await Promise.all([
        supabase.from("transactions").select("id, type, amount, description, created_at, status").order("created_at", { ascending: false }).limit(10),
        supabase.from("api_integrations").select("id, platform, last_synced_at").order("last_synced_at", { ascending: false }).limit(3),
      ]);

      const txnActivities: Activity[] = (txnRes.data ?? []).map((t: any) => ({
        id: t.id,
        type: t.type,
        description: t.description || `${t.type === "credit" ? "Payment received" : "Spend recorded"}`,
        amount: Number(t.amount),
        time: t.created_at,
        status: t.status,
      }));

      const syncActivities: Activity[] = (syncRes.data ?? [])
        .filter((s: any) => s.last_synced_at)
        .map((s: any) => ({
          id: `sync-${s.id}`,
          type: "sync" as const,
          description: `${(s.platform as string).charAt(0).toUpperCase() + (s.platform as string).slice(1)} sync completed`,
          time: s.last_synced_at,
        }));

      const all = [...txnActivities, ...syncActivities]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 10);

      setActivities(all);
      setLoading(false);
    };
    fetchData();
  }, []);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (loading) return <Skeleton className="h-[320px]" />;

  return (
    <Card className="dark:bg-card/80 dark:backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
        ) : (
          <div className="space-y-1">
            {activities.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50 transition-colors">
                <div className="shrink-0">
                  {a.type === "credit" && <ArrowUpCircle className="h-4 w-4 text-success" />}
                  {a.type === "debit" && <ArrowDownCircle className="h-4 w-4 text-destructive" />}
                  {a.type === "sync" && <RefreshCw className="h-4 w-4 text-primary" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{a.description}</p>
                  <p className="text-xs text-muted-foreground">{formatTime(a.time)}</p>
                </div>
                {a.amount !== undefined && (
                  <span className="text-sm font-mono font-medium shrink-0">
                    {a.type === "credit" ? "+" : "-"}${a.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                )}
                {a.status === "pending_approval" && (
                  <Badge variant="outline" className="text-xs shrink-0">Pending</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
