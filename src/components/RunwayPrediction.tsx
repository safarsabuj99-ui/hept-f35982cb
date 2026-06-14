import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getDhakaDateString } from "@/components/DateRangeFilter";

interface RunwayClient {
  user_id: string;
  full_name: string;
  balance: number;
  avgDailySpend: number;
  runwayDays: number;
  projectedStopDate: Date;
  pauseThreshold: number;
  isSystemPaused: boolean;
}

export function RunwayPrediction() {
  const { authReady } = useAuth();
  const [clients, setClients] = useState<RunwayClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authReady) return;
    fetchData();
  }, [authReady]);

  async function fetchData() {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
    const clientIds = roles?.map((r) => r.user_id) ?? [];
    if (clientIds.length === 0) { setLoading(false); return; }

    const threeDaysStr = getDhakaDateString(-3);

    // Pull campaigns (with client_id) so we can attribute raw daily_metrics spend to a client.
    const campaigns = await fetchAllRows<any>(() =>
      supabase.from("campaigns").select("id, client_id").in("client_id", clientIds)
    );
    const campaignToClient: Record<string, string> = {};
    for (const c of campaigns ?? []) {
      if (c.client_id) campaignToClient[c.id] = c.client_id;
    }
    const campaignIds = Object.keys(campaignToClient);

    if (campaignIds.length === 0) { setLoading(false); return; }

    const [profilesRes, txns, recentSpend] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, system_paused_campaigns, overdraft_limit_usd, auto_pause_balance_usd").in("user_id", clientIds),
      fetchAllRows<any>(() => supabase.from("transactions").select("client_id, type, amount, status")),
      fetchAllRows<any>(() =>
        supabase
          .from("daily_metrics")
          .select("campaign_id, spend, data_date")
          .in("campaign_id", campaignIds)
          .gte("data_date", threeDaysStr)
      ),
    ]);
    const txnsRes = { data: txns };

    // Client spend last 3 days from raw per-campaign metrics (same source as Campaign tab).
    const clientSpend3d: Record<string, number> = {};
    for (const s of recentSpend ?? []) {
      const cid = campaignToClient[s.campaign_id];
      if (cid) clientSpend3d[cid] = (clientSpend3d[cid] || 0) + Number(s.spend);
    }

    const result: RunwayClient[] = [];
    for (const p of profilesRes.data ?? []) {
      const clientTxns = (txnsRes.data ?? []).filter((t: any) => t.client_id === p.user_id && t.status === "completed");
      const credits = clientTxns.filter((t: any) => t.type === "credit").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const debits = clientTxns.filter((t: any) => t.type === "debit").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const balance = credits - debits;
      const overdraft = Number((p as any).overdraft_limit_usd ?? 0);

      const spend3d = clientSpend3d[p.user_id] || 0;
      const avgDaily = spend3d / 3;

      if (avgDaily <= 0) continue;

      const effectiveBalance = balance + overdraft;
      const runwayDays = effectiveBalance > 0 ? effectiveBalance / avgDaily : 0;
      const projectedStop = new Date();
      projectedStop.setDate(projectedStop.getDate() + runwayDays);

      const pauseThreshold = Number((p as any).auto_pause_balance_usd ?? 5);

      const pausedCampaigns = (p as any).system_paused_campaigns;
      const isSystemPaused = Array.isArray(pausedCampaigns) && pausedCampaigns.length > 0;

      if (runwayDays < 7) {
        result.push({
          user_id: p.user_id,
          full_name: p.full_name,
          balance,
          avgDailySpend: avgDaily,
          runwayDays: Math.round(runwayDays * 10) / 10,
          projectedStopDate: projectedStop,
          pauseThreshold,
          isSystemPaused,
        });
      }
    }

    result.sort((a, b) => a.runwayDays - b.runwayDays);
    setClients(result);
    setLoading(false);
  }

  if (loading) return <Skeleton className="h-32" />;
  if (clients.length === 0) return null;

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <TrendingDown className="h-4 w-4 text-destructive" /> Zero-Balance Predictions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {clients.map((c) => {
          const isCritical = c.runwayDays < 1;
          const isWarning = c.runwayDays < 3;
          return (
            <div
              key={c.user_id}
              className={cn(
                "flex items-center justify-between rounded-lg p-3 text-sm",
                isCritical ? "bg-destructive/10 border border-destructive/30" : "bg-card"
              )}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{c.full_name}</p>
                  {c.isSystemPaused && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      SYSTEM PAUSED
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Avg daily: {fmt(c.avgDailySpend)} · Guard at: {fmt(c.pauseThreshold)}
                </p>
              </div>
              <div className="text-right space-y-0.5">
                <p className="font-mono text-sm">{fmt(c.balance)}</p>
                <div className="flex items-center gap-1 justify-end">
                  {isCritical ? (
                    <Badge variant="destructive" className={cn("text-xs gap-1", isCritical && "animate-pulse")}>
                      <AlertTriangle className="h-3 w-3" />
                      {c.runwayDays <= 0 ? "DEPLETED" : `${c.runwayDays}d left`}
                    </Badge>
                  ) : isWarning ? (
                    <Badge variant="destructive" className="text-xs gap-1">
                      <Clock className="h-3 w-3" />
                      {c.runwayDays}d · {c.projectedStopDate.toLocaleDateString()}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Clock className="h-3 w-3" />
                      {c.runwayDays}d left
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
