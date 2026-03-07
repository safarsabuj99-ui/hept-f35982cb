import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Shield, AlertTriangle, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface TokenHealth {
  id: string;
  instance_name: string;
  platform: string;
  daysRemaining: number | null;
  status: "ok" | "warning" | "critical" | "expired";
}

interface AccountLimit {
  id: string;
  ad_account_id: string;
  platform_name: string;
  account_spending_limit: number;
  todaySpend: number;
  usagePercent: number;
  status: "ok" | "warning" | "critical";
}

export function SystemHealthWidget() {
  const [tokens, setTokens] = useState<TokenHealth[]>([]);
  const [limits, setLimits] = useState<AccountLimit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealth();
  }, []);

  const fetchHealth = async () => {
    const today = new Date().toISOString().split("T")[0];

    const [intRes, accRes, spendRes] = await Promise.all([
      supabase.from("api_integrations" as any).select("id, instance_name, platform, token_expiry_date, connection_status, is_active") as any,
      supabase.from("ad_accounts" as any).select("id, ad_account_id, platform_name, daily_spending_limit, is_active").eq("is_active", true) as any,
      supabase.from("daily_ad_spend").select("ad_account_id, final_billable_usd").eq("date", today),
    ]);

    // Token health
    const now = new Date();
    const tokenList: TokenHealth[] = ((intRes.data ?? []) as any[])
      .filter((i: any) => i.is_active)
      .map((i: any) => {
        let daysRemaining: number | null = null;
        let status: TokenHealth["status"] = "ok";
        if (i.token_expiry_date) {
          const expiry = new Date(i.token_expiry_date);
          daysRemaining = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
          if (daysRemaining <= 0) status = "expired";
          else if (daysRemaining <= 3) status = "critical";
          else if (daysRemaining <= 7) status = "warning";
        }
        return { id: i.id, instance_name: i.instance_name || i.platform, platform: i.platform, daysRemaining, status };
      });

    // Spending limits
    const spendByAccount: Record<string, number> = {};
    for (const r of (spendRes.data ?? []) as any[]) {
      spendByAccount[r.ad_account_id] = (spendByAccount[r.ad_account_id] || 0) + Number(r.final_billable_usd);
    }

    const limitList: AccountLimit[] = ((accRes.data ?? []) as any[])
      .filter((a: any) => a.daily_spending_limit && a.daily_spending_limit > 0)
      .map((a: any) => {
        const todaySpend = spendByAccount[a.id] || 0;
        const usagePercent = Math.min(Math.round((todaySpend / a.daily_spending_limit) * 100), 100);
        let status: AccountLimit["status"] = "ok";
        if (usagePercent >= 90) status = "critical";
        else if (usagePercent >= 75) status = "warning";
        return { id: a.id, ad_account_id: a.ad_account_id, platform_name: a.platform_name, daily_spending_limit: a.daily_spending_limit, todaySpend, usagePercent, status };
      });

    setTokens(tokenList);
    setLimits(limitList);
    setLoading(false);
  };

  const criticalTokens = tokens.filter((t) => t.status === "critical" || t.status === "expired");
  const warningTokens = tokens.filter((t) => t.status === "warning");
  const criticalLimits = limits.filter((l) => l.status === "critical");
  const warningLimits = limits.filter((l) => l.status === "warning");

  const overallStatus = criticalTokens.length > 0 || criticalLimits.length > 0
    ? "critical"
    : warningTokens.length > 0 || warningLimits.length > 0
    ? "warning"
    : "healthy";

  const statusConfig = {
    critical: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Issues Found" },
    warning: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", label: "Warnings" },
    healthy: { icon: CheckCircle, color: "text-success", bg: "bg-success/10", label: "All Clear" },
  };

  const cfg = statusConfig[overallStatus];

  if (loading) {
    return (
      <Card className="dark:bg-card/80 dark:backdrop-blur-sm">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-card/80 dark:backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Shield className="h-4 w-4" /> System Health
          </CardTitle>
          <Badge variant="outline" className={`${cfg.color} gap-1`}>
            <cfg.icon className="h-3 w-3" /> {cfg.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Token Health */}
        {tokens.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">API Tokens</p>
            <div className="space-y-1.5">
              {tokens.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs">
                  <span className="font-medium capitalize">{t.instance_name}</span>
                  {t.daysRemaining === null ? (
                    <Badge variant="secondary" className="text-xs">No Expiry Set</Badge>
                  ) : t.status === "expired" ? (
                    <Badge variant="destructive" className="text-xs">Expired</Badge>
                  ) : t.status === "critical" ? (
                    <Badge variant="destructive" className="text-xs">{t.daysRemaining}d left</Badge>
                  ) : t.status === "warning" ? (
                    <Badge className="bg-warning text-warning-foreground text-xs">{t.daysRemaining}d left</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">{t.daysRemaining}d left</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Spending Limits */}
        {limits.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spending Limits</p>
            <div className="space-y-2">
              {limits.filter((l) => l.status !== "ok").length === 0 ? (
                <p className="text-xs text-muted-foreground">All accounts within limits</p>
              ) : (
                limits
                  .filter((l) => l.status !== "ok")
                  .map((l) => (
                    <div key={l.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium font-mono">{l.ad_account_id}</span>
                        <span className={l.status === "critical" ? "text-destructive font-semibold" : "text-warning font-semibold"}>
                          ${l.todaySpend.toFixed(0)} / ${l.daily_spending_limit}
                        </span>
                      </div>
                      <Progress
                        value={l.usagePercent}
                        className={`h-1.5 ${l.status === "critical" ? "[&>div]:bg-destructive" : "[&>div]:bg-warning"}`}
                      />
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="flex gap-4 pt-1 text-xs text-muted-foreground">
          {criticalTokens.length > 0 && <span className="text-destructive">{criticalTokens.length} token(s) expiring</span>}
          {criticalLimits.length > 0 && <span className="text-destructive">{criticalLimits.length} near limit</span>}
          {warningLimits.length > 0 && <span className="text-warning">{warningLimits.length} approaching limit</span>}
        </div>
      </CardContent>
    </Card>
  );
}
