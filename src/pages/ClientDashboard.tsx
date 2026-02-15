import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SpendTrendChart } from "@/components/SpendTrendChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DollarSign, TrendingDown, Clock, Info } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from "recharts";

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
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const [{ data: txData }, { data: accounts }] = await Promise.all([
      supabase.from("transactions").select("*").eq("client_id", user.id).order("date", { ascending: false }),
      supabase.from("ad_accounts" as any).select("id").eq("client_id", user.id) as any,
    ]);
    setTransactions((txData as Transaction[]) ?? []);

    const accIds = accounts?.map((a: any) => a.id) ?? [];
    if (accIds.length > 0) {
      const { data: spend } = await (supabase.from("daily_ad_spend" as any).select("*").in("ad_account_id", accIds).order("date", { ascending: false }) as any);
      setAdSpend(spend ?? []);
      if (spend?.[0]?.synced_at) setLastSynced(new Date(spend[0].synced_at).toLocaleString());
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime subscriptions
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('client-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_ad_spend' }, () => {
        fetchAll();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchAll]);

  const credits = transactions.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
  const debits = transactions.filter((t) => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);
  const balance = credits - debits;
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  // Platform breakdown from daily_ad_spend
  const spendByPlatform: Record<string, { usd: number; raw: { amount: number; currency: string }[] }> = {};
  for (const row of adSpend) {
    const acc = row.ad_account_id; // We'll group by platform from accounts later
    // For simplicity, group from the campaign data
  }

  // Use transactions for platform pie (existing logic)
  const platformData = Object.entries(
    transactions
      .filter((t) => t.type === "debit" && t.platform)
      .reduce<Record<string, number>>((acc, t) => {
        const key = t.platform!;
        acc[key] = (acc[key] || 0) + Number(t.amount);
        return acc;
      }, {})
  ).map(([platform, value]) => ({ name: PLATFORM_LABELS[platform] || platform, value, platform }));

  // Also build from daily_ad_spend for transparency tooltips
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
        <div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-primary">{fmt(balance)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Spent</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><p className="text-3xl font-bold">{fmt(debits)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last Updated</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {transactions.length > 0
                ? new Date(transactions[0].created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Platform pie + bar charts */}
      {platformData.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-lg">Platform Split</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={platformData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {platformData.map((entry) => <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform] || "#888"} />)}
                  </Pie>
                  <RTooltip formatter={(value: number) => fmt(value)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg">Spend by Platform</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={platformData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <RTooltip formatter={(value: number) => fmt(value)} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {platformData.map((entry) => <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform] || "#888"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Spend trend from daily_ad_spend */}
      {user && <SpendTrendChart clientId={user.id} />}

      {/* Daily ad spend with transparency */}
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

      {/* Transaction history */}
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
