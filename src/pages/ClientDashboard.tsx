import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { SpendTrendChart } from "@/components/SpendTrendChart";
import { ClientDateFilter, ClientDateRange, ClientDatePreset, getLocalTodayClient } from "@/components/ClientDateFilter";
import { getDhakaDateString } from "@/components/DateRangeFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DashboardSkeleton } from "@/components/ui/premium-skeletons";
import { DepositFundsDialog } from "@/components/DepositFundsDialog";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet, Zap, Clock, Shield, ArrowDown, ArrowUp, Minus,
  Plus, Loader2, Banknote, TrendingUp, BarChart3, Sparkles
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { startOfDay, endOfDay } from "date-fns";

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

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function WalletHealthBar({ balance, avgDailySpend }: { balance: number; avgDailySpend: number }) {
  const runwayDays = avgDailySpend > 0 ? balance / avgDailySpend : balance > 0 ? 999 : 0;
  const maxDays = 30;
  const progressValue = Math.min((runwayDays / maxDays) * 100, 100);
  const state = runwayDays < 1 ? "critical" : runwayDays < 3 ? "warning" : "healthy";

  return (
    <div className="space-y-2 mt-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-primary-foreground/70 uppercase tracking-wider">Wallet Runway</span>
        <span className={cn(
          "text-sm font-bold font-mono",
          state === "critical" && "text-red-300 animate-pulse",
          state === "warning" && "text-amber-300",
          state === "healthy" && "text-emerald-300"
        )}>
          {runwayDays >= 999 ? "∞ days" : `~${Math.floor(runwayDays)} days`}
        </span>
      </div>
      <Progress
        value={progressValue}
        className={cn(
          "h-2 rounded-full bg-primary-foreground/20",
          state === "critical" && "[&>div]:bg-red-400",
          state === "warning" && "[&>div]:bg-amber-400",
          state === "healthy" && "[&>div]:bg-emerald-400"
        )}
      />
      {state === "critical" && (
        <p className="text-xs text-red-300 font-medium animate-pulse flex items-center gap-1">
          <Shield className="h-3 w-3" /> Low Balance — Contact your agency
        </p>
      )}
      {state === "warning" && (
        <p className="text-xs text-amber-300 font-medium flex items-center gap-1">
          <Shield className="h-3 w-3" /> Balance running low
        </p>
      )}
    </div>
  );
}

function GrowthIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const pctChange = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
  const isUp = pctChange > 0;
  const isNeutral = Math.abs(pctChange) < 1;

  return (
    <div className={cn(
      "flex items-center gap-1 text-xs font-medium mt-1",
      isNeutral ? "text-muted-foreground" : isUp ? "text-emerald-500" : "text-muted-foreground"
    )}>
      {isNeutral ? (
        <><Minus className="h-3 w-3" /> No change</>
      ) : isUp ? (
        <><ArrowUp className="h-3 w-3" /> {Math.abs(pctChange).toFixed(0)}% Growth</>
      ) : (
        <><ArrowDown className="h-3 w-3" /> {Math.abs(pctChange).toFixed(0)}%</>
      )}
      <span className="text-muted-foreground/60 ml-1">vs last 30d</span>
    </div>
  );
}

function ShimmerLoader() {
  return <DashboardSkeleton />;
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const { effectiveClientId } = useImpersonation();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [adSpend, setAdSpend] = useState<any[]>([]);
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [pricingConfig, setPricingConfig] = useState<any>(null);

  const [depositOpen, setDepositOpen] = useState(false);
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<ClientDateRange | null>(() => { const t = getLocalTodayClient(); return { from: t, to: t }; });
  const [datePreset, setDatePreset] = useState<ClientDatePreset>("today");

  const today = getDhakaDateString();

  useEffect(() => {
    if (!effectiveClientId) return;
    supabase.from("profiles").select("full_name, pricing_config").eq("user_id", effectiveClientId).single()
      .then(({ data }) => {
        if (data?.full_name) setClientName(data.full_name);
        if (data?.pricing_config) setPricingConfig(data.pricing_config as any);
      });
  }, [effectiveClientId]);

  const fetchAll = useCallback(async () => {
    if (!effectiveClientId) return;
    const [{ data: txData }, { data: accountLinks }] = await Promise.all([
      supabase.from("transactions").select("*").eq("client_id", effectiveClientId).order("date", { ascending: false }),
      supabase.from("ad_account_clients").select("ad_account_id, mapping_keyword").eq("client_id", effectiveClientId).neq("mapping_keyword", ""),
    ]);
    setTransactions((txData as Transaction[]) ?? []);

    const accIds = accountLinks?.map((a: any) => a.ad_account_id) ?? [];
    
    if (accIds.length > 0) {
      const { data: accounts } = await supabase.from("ad_accounts").select("*").in("id", accIds);
      setAdAccounts(accounts ?? []);
      
      const { data: campaigns } = await supabase.from("campaigns").select("id, ad_account_id, platform").in("ad_account_id", accIds);
      const campIds = campaigns?.map((c: any) => c.id) ?? [];
      if (campIds.length > 0) {
        const { data: metrics } = await supabase.from("daily_metrics").select("*").in("campaign_id", campIds).order("data_date", { ascending: false });
        const enriched = (metrics ?? []).map((m: any) => {
          const camp = campaigns?.find((c: any) => c.id === m.campaign_id);
          return { ...m, ad_account_id: camp?.ad_account_id, platform_name: camp?.platform, date: m.data_date, final_billable_usd: m.spend };
        });
        setAdSpend(enriched);
        if (enriched[0]?.synced_at) setLastSynced(new Date(enriched[0].synced_at).toLocaleString());
      }
    }
    const { data: prs } = await (supabase.from("payment_requests" as any).select("*").eq("client_id", effectiveClientId).order("created_at", { ascending: false }) as any);
    setPaymentRequests(prs ?? []);
    setLoading(false);
  }, [effectiveClientId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!effectiveClientId) return;
    const channel = supabase
      .channel('client-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_metrics' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_performance' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaigns' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [effectiveClientId, fetchAll]);

  const credits = transactions.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
  const debits = transactions.filter((t) => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);
  const balance = credits - debits;

  const platformBalances = useMemo(() => {
    const platforms = ["meta", "tiktok", "google"] as const;
    return platforms.map((p) => {
      const pCredits = transactions.filter((t) => t.type === "credit" && t.platform === p).reduce((s, t) => s + Number(t.amount), 0);
      const pDebits = transactions.filter((t) => t.type === "debit" && t.platform === p).reduce((s, t) => s + Number(t.amount), 0);
      return { platform: p, label: PLATFORM_LABELS[p], balance: pCredits - pDebits, color: PLATFORM_COLORS[p] };
    });
  }, [transactions]);
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtBdt = (n: number) => `৳${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const getPlatformRate = (platform: string) => pricingConfig?.flat_rates?.[platform] || pricingConfig?.platform_rates?.[platform] || 120;

  const totalNegativeBdt = useMemo(() => {
    if (balance >= 0) return 0;
    return platformBalances.reduce((sum, pb) => {
      if (pb.balance < 0) {
        return sum + Math.abs(pb.balance) * getPlatformRate(pb.platform);
      }
      return sum;
    }, 0);
  }, [platformBalances, balance, pricingConfig]);

  const handleDateChange = (range: ClientDateRange | null, p: ClientDatePreset) => {
    setDateRange(range);
    setDatePreset(p);
  };

  const filterByDate = useCallback((items: any[], dateField: string) => {
    if (!dateRange) return items;
    return items.filter((item) => {
      const d = new Date(item[dateField]);
      return d >= dateRange.from && d <= dateRange.to;
    });
  }, [dateRange]);

  const visibleTransactions = useMemo(() => transactions.filter(t => !t.description?.startsWith("auto_spend:")), [transactions]);
  const filteredTransactions = useMemo(() => filterByDate(visibleTransactions, "date"), [visibleTransactions, filterByDate]);
  const filteredAdSpend = useMemo(() => filterByDate(adSpend, "date"), [adSpend, filterByDate]);
  const filteredPaymentRequests = useMemo(() => filterByDate(paymentRequests, "created_at"), [paymentRequests, filterByDate]);

  const todaySpend = adSpend
    .filter((s: any) => s.date === today)
    .reduce((sum: number, s: any) => sum + Number(s.final_billable_usd), 0);

  const last7 = adSpend.filter((s: any) => {
    const daysAgo = (Date.now() - new Date(s.date).getTime()) / 86400000;
    return daysAgo <= 7;
  });
  const avgDailySpend = last7.length > 0
    ? last7.reduce((s: number, r: any) => s + Number(r.final_billable_usd), 0) / 7
    : 0;

  const currentTotalSpend = filteredAdSpend.reduce((s: number, r: any) => s + Number(r.final_billable_usd), 0);

  const now = Date.now();
  const prev30d = adSpend.filter((s: any) => {
    const daysAgo = (now - new Date(s.date).getTime()) / 86400000;
    return daysAgo > 30 && daysAgo <= 60;
  });
  const prevTotalSpend = prev30d.reduce((s: number, r: any) => s + Number(r.final_billable_usd), 0);

  const platformSpend: Record<string, number> = {};
  for (const row of filteredAdSpend) {
    const acc = adAccounts.find((a: any) => a.id === row.ad_account_id);
    const platform = acc?.platform_name || "unknown";
    platformSpend[platform] = (platformSpend[platform] || 0) + Number(row.final_billable_usd);
  }
  const platformData = Object.entries(platformSpend)
    .map(([platform, value]) => ({ name: PLATFORM_LABELS[platform] || platform, value, platform }))
    .sort((a, b) => b.value - a.value);

  const activeAccounts = adAccounts.filter((a: any) => a.is_active).length;

  if (loading) return <ShimmerLoader />;

  return (
    <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto animate-fade-in">
      {/* Personalized Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 md:h-5 md:w-5 text-primary" />
            <span className="text-xs md:text-sm font-medium text-primary">{getGreeting()}</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight">
            {clientName ? `Welcome back, ${clientName.split(" ")[0]}` : "My Dashboard"}
          </h1>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            {lastSynced && (
              <span className="stat-pill text-[10px] md:text-xs">
                <Clock className="h-3 w-3" /> Synced: {lastSynced}
              </span>
            )}
            {activeAccounts > 0 && (
              <span className="stat-pill text-[10px] md:text-xs">
                <span className="pulse-dot" /> {activeAccounts} Active
              </span>
            )}
          </div>
        </div>
        <Button
          onClick={() => setDepositOpen(true)}
          className="gap-2 w-full sm:w-auto h-12 sm:h-11 px-6 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:-translate-y-0.5"
          size="lg"
        >
          <Plus className="h-4 w-4" /> Add Funds
        </Button>
      </div>

      {/* Date Filter */}
      <ClientDateFilter onRangeChange={handleDateChange} activePreset={datePreset} />

      {/* Financial Overview Section */}
      <div>
        <div className="section-label">Financial Overview</div>
        <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2">
          {/* Balance Card - Hero */}
          <div className="glass-card glow-border p-4 md:p-6 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
            <div className="flex items-center gap-3 mb-3 md:mb-4">
              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-primary-foreground/15 backdrop-blur-sm">
                <Wallet className="h-5 w-5 md:h-6 md:w-6" />
              </div>
              <div>
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-primary-foreground/70">Available Balance</p>
              </div>
            </div>
            <p className="text-3xl md:text-5xl font-bold font-mono count-up">{fmt(balance)}</p>
            {balance < 0 && totalNegativeBdt > 0 && (
              <p className="text-base md:text-lg font-bold font-mono text-red-300 mt-1">-{fmtBdt(totalNegativeBdt)}</p>
            )}
            <WalletHealthBar balance={balance} avgDailySpend={avgDailySpend} />
          </div>

          {/* Platform Sub-Balances — horizontal scroll on mobile */}
          <div className="sm:col-span-2">
            <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory md:grid md:grid-cols-3 md:overflow-visible pb-1 md:pb-0">
              {platformBalances.map((pb) => {
                const bdtAmount = pb.balance < 0 ? Math.abs(pb.balance) * getPlatformRate(pb.platform) : 0;
                return (
                  <div key={pb.platform} className="glass-card glow-border p-3 md:p-4 flex flex-col items-center text-center min-w-[130px] snap-start shrink-0 md:min-w-0 md:shrink">
                    <span className="h-2.5 w-2.5 rounded-full mb-1.5 md:mb-2" style={{ background: pb.color }} />
                    <p className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-wider">{pb.label}</p>
                    <p className={cn("text-base md:text-xl font-bold font-mono mt-1", pb.balance < 0 ? "text-destructive" : "")}>
                      {fmt(pb.balance)}
                    </p>
                    {pb.balance < 0 && (
                      <p className="text-[10px] md:text-xs font-bold font-mono text-destructive mt-0.5">-{fmtBdt(bdtAmount)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Spend Card */}
          <div className="glass-card glow-border p-4 md:p-6">
            <div className="flex items-center gap-3 mb-3 md:mb-4">
              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-accent">
                <Zap className="h-5 w-5 md:h-6 md:w-6 text-accent-foreground" />
              </div>
              <div>
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {dateRange ? "Spend (Filtered)" : "Spend (30d)"}
                </p>
              </div>
            </div>
            <p className="text-3xl md:text-5xl font-bold font-mono">{fmt(currentTotalSpend)}</p>
            <GrowthIndicator current={currentTotalSpend} previous={prevTotalSpend} />
            <div className="mt-3 md:mt-4 flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 md:h-4 md:w-4" />
              Today: <span className="font-mono font-medium text-foreground">{fmt(todaySpend)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ad Performance Section */}
      {(platformData.length > 0 || user) && (
        <div>
          <div className="section-label">Ad Performance</div>
          <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-2">
            {/* Platform Donut */}
            {platformData.length > 0 && (
              <div className="glass-card glow-border p-4 md:p-6">
                <div className="flex items-center gap-2 mb-3 md:mb-4">
                  <BarChart3 className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                  <h3 className="font-semibold text-sm md:text-base">Platform Spend Split</h3>
                </div>
                <ResponsiveContainer width="100%" height={180} className="md:!h-[240px]">
                  <PieChart>
                    <Pie data={platformData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {platformData.map((entry) => <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform] || "#888"} />)}
                    </Pie>
                    <RTooltip formatter={(value: number) => fmt(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-3 md:gap-4 mt-2 flex-wrap">
                  {platformData.map((p) => (
                    <div key={p.platform} className="flex items-center gap-1.5 text-[10px] md:text-xs text-muted-foreground">
                      <span className="h-2 w-2 md:h-2.5 md:w-2.5 rounded-full" style={{ background: PLATFORM_COLORS[p.platform] || "#888" }} />
                      {p.name}: <span className="font-mono font-medium text-foreground">{fmt(p.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Spend Trend */}
            {user && (
              <div className="glass-card glow-border overflow-hidden">
                <SpendTrendChart clientId={user.id} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity Section */}
      <div>
        <div className="section-label">Activity</div>

        {/* Transaction History */}
        <div className="glass-card glow-border overflow-hidden">
          <div className="p-4 md:p-6 pb-0 flex items-center justify-between">
            <h3 className="font-semibold text-sm md:text-base flex items-center gap-2">
              Transaction History
              <Badge variant="secondary" className="text-[10px] font-normal">View Only</Badge>
            </h3>
          </div>
          <div className="p-4 md:p-6">
            {filteredTransactions.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">No transactions for this period</p>
            ) : (
              <>
                {/* Mobile card view */}
                <div className="flex flex-col gap-2 md:hidden">
                  {filteredTransactions.map((t) => (
                    <div key={t.id} className="mobile-card flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                          t.type === "credit" ? "bg-emerald-500/10" : "bg-destructive/10"
                        )}>
                          {t.type === "credit" ? <ArrowDown className="h-4 w-4 text-emerald-500" /> : <ArrowUp className="h-4 w-4 text-destructive" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium capitalize">{t.type === "credit" ? "Deposit" : "Spend"}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            {t.platform ? ` · ${PLATFORM_LABELS[t.platform]}` : ""}
                          </p>
                        </div>
                      </div>
                      <span className={cn("font-mono text-sm font-medium shrink-0", t.type === "credit" ? "text-emerald-500" : "text-destructive")}>
                        {t.type === "credit" ? "+" : "-"}{fmt(Number(t.amount))}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Desktop table view */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/50">
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Platform</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.map((t) => (
                        <TableRow key={t.id} className="border-border/30 hover:bg-accent/50 transition-colors">
                          <TableCell className="whitespace-nowrap">{new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                          <TableCell>
                            <Badge variant={t.type === "credit" ? "default" : "destructive"} className="capitalize">
                              {t.type === "credit" ? "Deposit" : "Spend"}
                            </Badge>
                          </TableCell>
                          <TableCell>{t.platform ? PLATFORM_LABELS[t.platform] : "—"}</TableCell>
                          <TableCell>{t.description || "—"}</TableCell>
                          <TableCell className="text-right font-mono">
                            <span className={t.type === "credit" ? "text-emerald-500" : "text-destructive"}>
                              {t.type === "credit" ? "+" : "-"}{fmt(Number(t.amount))}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Payment Requests */}
      {filteredPaymentRequests.length > 0 && (
        <div className="glass-card glow-border overflow-hidden">
          <div className="p-4 md:p-6 pb-0">
            <h3 className="font-semibold text-sm md:text-base flex items-center gap-2">
              <Banknote className="h-4 w-4 md:h-5 md:w-5 text-primary" /> Payment Requests
            </h3>
          </div>
          <div className="p-4 md:p-6">
            {/* Mobile card view */}
            <div className="flex flex-col gap-2 md:hidden">
              {filteredPaymentRequests.map((pr: any) => (
                <div key={pr.id} className="mobile-card flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{pr.payment_method}</Badge>
                      {pr.status === "pending" && <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">Pending</Badge>}
                      {pr.status === "approved" && <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">Approved</Badge>}
                      {pr.status === "rejected" && <Badge variant="destructive" className="text-[10px]">Rejected</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(pr.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm font-medium">৳{Number(pr.amount_bdt).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                    {pr.final_amount_usd && <p className="text-[10px] text-muted-foreground font-mono">${Number(pr.final_amount_usd).toFixed(2)}</p>}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount (BDT)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Credited (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPaymentRequests.map((pr: any) => (
                    <TableRow key={pr.id} className="border-border/30 hover:bg-accent/50 transition-colors">
                      <TableCell className="whitespace-nowrap">{new Date(pr.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                      <TableCell><Badge variant="secondary">{pr.payment_method}</Badge></TableCell>
                      <TableCell className="text-right font-mono">৳{Number(pr.amount_bdt).toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>
                        {pr.status === "pending" && <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Pending</Badge>}
                        {pr.status === "approved" && <Badge variant="outline" className="bg-success/10 text-success border-success/30">Approved</Badge>}
                        {pr.status === "rejected" && <Badge variant="destructive">Rejected</Badge>}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {pr.final_amount_usd ? `$${Number(pr.final_amount_usd).toFixed(2)}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      <DepositFundsDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        clientId={user?.id}
        onSuccess={fetchAll}
      />
    </div>
  );
}
