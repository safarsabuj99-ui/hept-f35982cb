import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SpendTrendChart } from "@/components/SpendTrendChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DollarSign, TrendingDown, TrendingUp, Clock, Info, Wallet, Zap } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer } from "recharts";

const PLATFORM_COLORS: Record<string, string> = {
  meta: "hsl(214, 80%, 52%)",
  tiktok: "hsl(340, 75%, 55%)",
  google: "hsl(142, 60%, 45%)",
};
const PLATFORM_LABELS: Record<string, string> = { meta: "Meta", tiktok: "TikTok", google: "Google" };

interface Transaction {
  id: string; type: "credit" | "debit"; amount: number; platform: string | null;
  description: string | null; date: string; created_at: string;
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [adSpend, setAdSpend] = useState<any[]>([]);
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const [{ data: txData }, { data: accounts }] = await Promise.all([
      supabase.from("transactions").select("*").eq("client_id", user.id).order("date", { ascending: false }),
      supabase.from("ad_accounts" as any).select("*").eq("client_id", user.id) as any,
    ]);
    setTransactions((txData as Transaction[]) ?? []);
    setAdAccounts(accounts ?? []);

    const accIds = accounts?.map((a: any) => a.id) ?? [];
    if (accIds.length > 0) {
      const { data: spend } = await (supabase.from("daily_ad_spend" as any).select("*").in("ad_account_id", accIds).order("date", { ascending: false }) as any);
      setAdSpend(spend ?? []);
      if (spend?.[0]?.synced_at) setLastSynced(new Date(spend[0].synced_at).toLocaleString());
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('client-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_ad_spend' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchAll]);

  const credits = transactions.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
  const debits = transactions.filter((t) => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);
  const balance = credits - debits;
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  // Today's spend from daily_ad_spend
  const todaySpend = adSpend
    .filter((s: any) => s.date === today)
    .reduce((sum: number, s: any) => sum + Number(s.final_billable_usd), 0);

  // 7-day avg spend for "Remaining Funds" projection
  const last7 = adSpend.filter((s: any) => {
    const d = new Date(s.date);
    const daysAgo = (Date.now() - d.getTime()) / 86400000;
    return daysAgo <= 7;
  });
  const avgDailySpend = last7.length > 0
    ? last7.reduce((s: number, r: any) => s + Number(r.final_billable_usd), 0) / 7
    : 0;
  const daysRemaining = avgDailySpend > 0 ? Math.floor(balance / avgDailySpend) : balance > 0 ? 999 : 0;

  // Platform breakdown from daily_ad_spend (more accurate)
  const platformSpend: Record<string, number> = {};
  for (const row of adSpend) {
    const acc = adAccounts.find((a: any) => a.id === row.ad_account_id);
    const platform = acc?.platform_name || "unknown";
    platformSpend[platform] = (platformSpend[platform] || 0) + Number(row.final_billable_usd);
  }
  const platformData = Object.entries(platformSpend)
    .map(([platform, value]) => ({ name: PLATFORM_LABELS[platform] || platform, value, platform }))
    .sort((a, b) => b.value - a.value);

  const spendWithRaw = adSpend.map((s: any) => ({
    date: s.date,
    billable: Number(s.final_billable_usd),
    rawAmount: Number(s.raw_spend_amount),
    rawCurrency: s.raw_currency,
    campaign: s.campaign_name,
  }));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-36" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Dashboard</h1>
        <p className="text-muted-foreground flex items-center gap-2">
          Your ad spend overview
          {lastSynced && (
            <span className="inline-flex items-center gap-1 text-xs">
              <Clock className="h-3 w-3" /> Last synced: {lastSynced}
            </span>
          )}
        </p>
      </div>

      {/* Bold KPI Cards - Mobile First */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-full -mr-6 -mt-6" />
          <CardHeader className="flex flex-row items-center gap-3 pb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground">Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl md:text-4xl font-bold font-mono text-primary">{fmt(balance)}</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-destructive/30 bg-gradient-to-br from-destructive/10 to-destructive/5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-destructive/5 rounded-full -mr-6 -mt-6" />
          <CardHeader className="flex flex-row items-center gap-3 pb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/15">
              <Zap className="h-5 w-5 text-destructive" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground">Today's Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl md:text-4xl font-bold font-mono">{fmt(todaySpend)}</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center gap-3 pb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <TrendingDown className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl md:text-3xl font-bold font-mono">{fmt(debits)}</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center gap-3 pb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground">Remaining</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl md:text-3xl font-bold font-mono">
              {daysRemaining >= 999 ? "∞" : `~${daysRemaining}d`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {avgDailySpend > 0 ? `~${fmt(avgDailySpend)}/day avg` : "No spend data"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Platform Donut from daily_ad_spend */}
      {platformData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Platform Spend Split</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={platformData} cx="50%" cy="50%" innerRadius={65} outerRadius={100} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {platformData.map((entry) => <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform] || "#888"} />)}
                </Pie>
                <RTooltip formatter={(value: number) => fmt(value)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Spend trend */}
      {user && <SpendTrendChart clientId={user.id} />}

      {/* Ad Spend Details */}
      {spendWithRaw.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Ad Spend Details (Billable USD)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Billable (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spendWithRaw.slice(0, 50).map((s, i) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                      <TableCell>{s.campaign}</TableCell>
                      <TableCell className="text-right font-mono">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex items-center gap-1">
                            {fmt(s.billable)}
                            {s.rawCurrency === "BDT" && <Info className="h-3 w-3 text-muted-foreground" />}
                          </TooltipTrigger>
                          {s.rawCurrency === "BDT" && (
                            <TooltipContent>
                              <p>Original: ৳{s.rawAmount.toFixed(2)} BDT</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction History */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Transaction History</CardTitle></CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No transactions yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden sm:table-cell">Platform</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">{new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                      <TableCell>
                        <Badge variant={t.type === "credit" ? "default" : "destructive"} className="capitalize">
                          {t.type === "credit" ? "Deposit" : "Spend"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{t.platform ? PLATFORM_LABELS[t.platform] : "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{t.description || "—"}</TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={t.type === "credit" ? "text-success" : "text-destructive"}>
                          {t.type === "credit" ? "+" : "-"}{fmt(Number(t.amount))}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
