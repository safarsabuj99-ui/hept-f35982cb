import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  const [clients, setClients] = useState<RunwayClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
    const clientIds = roles?.map((r) => r.user_id) ?? [];
    if (clientIds.length === 0) { setLoading(false); return; }

    // Get mapped accounts with keywords
    const { data: mappedAssignments } = await supabase
      .from("ad_account_clients")
      .select("ad_account_id, client_id, mapping_keyword")
      .neq("mapping_keyword", "");
    
    const keywordsByAccount: Record<string, string[]> = {};
    const accToClient: Record<string, string> = {};
    for (const m of mappedAssignments ?? []) {
      if (!keywordsByAccount[m.ad_account_id]) keywordsByAccount[m.ad_account_id] = [];
      keywordsByAccount[m.ad_account_id].push((m.mapping_keyword || "").toLowerCase());
      accToClient[m.ad_account_id] = m.client_id;
    }
    const mappedAccountIds = Object.keys(keywordsByAccount);

    if (mappedAccountIds.length === 0) { setLoading(false); return; }

    const [profilesRes, txnsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, system_paused_campaigns, overdraft_limit_usd, auto_pause_balance_usd").in("user_id", clientIds),
      supabase.from("transactions").select("client_id, type, amount, status"),
    ]);

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysStr = threeDaysAgo.toISOString().split("T")[0];

    const { data: recentSpend } = await supabase
      .from("daily_ad_spend")
      .select("ad_account_id, final_billable_usd, campaign_name")
      .in("ad_account_id", mappedAccountIds)
      .gte("date", threeDaysStr);

    // Client spend last 3 days - only count matching campaigns
    const clientSpend3d: Record<string, number> = {};
    for (const s of recentSpend ?? []) {
      const keywords = keywordsByAccount[s.ad_account_id];
      if (!keywords || keywords.length === 0) continue;
      const nameLower = (s.campaign_name || "").toLowerCase();
      const matches = keywords.some((kw: string) => nameLower.includes(kw));
      if (matches) {
        const cid = accToClient[s.ad_account_id];
        if (cid) clientSpend3d[cid] = (clientSpend3d[cid] || 0) + Number(s.final_billable_usd);
      }
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
