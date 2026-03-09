import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getDhakaDateString } from "@/components/DateRangeFilter";

interface AlertClient {
  user_id: string;
  full_name: string;
  balance: number;
  avgDailySpend: number;
  daysRemaining: number;
}

export function LowBalanceAlerts() {
  const [alerts, setAlerts] = useState<AlertClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
      const clientIds = roles?.map((r) => r.user_id) ?? [];
      if (clientIds.length === 0) { setLoading(false); return; }

      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", clientIds);
      const { data: txns } = await supabase.from("transactions").select("client_id, type, amount, status, date");

      const sevenDaysStr = getDhakaDateString(-7);

      const result: AlertClient[] = [];
      for (const p of profiles ?? []) {
        const clientTxns = (txns ?? []).filter((t: any) => t.client_id === p.user_id && t.status === "completed");
        const credits = clientTxns.filter((t: any) => t.type === "credit").reduce((s: number, t: any) => s + Number(t.amount), 0);
        const debits = clientTxns.filter((t: any) => t.type === "debit").reduce((s: number, t: any) => s + Number(t.amount), 0);
        const balance = credits - debits;

        const recentDebits = clientTxns
          .filter((t: any) => t.type === "debit" && t.date >= sevenDaysStr)
          .reduce((s: number, t: any) => s + Number(t.amount), 0);
        const avgDaily = recentDebits / 7;

        if (avgDaily > 0) {
          const daysRemaining = balance / avgDaily;
          if (daysRemaining < 3 && daysRemaining >= 0) {
            result.push({ user_id: p.user_id, full_name: p.full_name, balance, avgDailySpend: avgDaily, daysRemaining: Math.round(daysRemaining * 10) / 10 });
          }
        }
      }
      setAlerts(result);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return <Skeleton className="h-24" />;
  if (alerts.length === 0) return null;

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="h-4 w-4" /> Low Balance Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((a) => (
          <div key={a.user_id} className="flex items-center justify-between rounded-lg bg-card p-3 text-sm">
            <div>
              <p className="font-medium">{a.full_name}</p>
              <p className="text-xs text-muted-foreground">Avg daily: {fmt(a.avgDailySpend)}</p>
            </div>
            <div className="text-right">
              <p className="font-mono">{fmt(a.balance)}</p>
              <Badge variant="destructive" className="text-xs">{a.daysRemaining}d left</Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
