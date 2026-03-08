import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { SpendTrendChart } from "@/components/SpendTrendChart";
import { ClientDateFilter, ClientDateRange, ClientDatePreset, getUtcTodayClient } from "@/components/ClientDateFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DashboardSkeleton } from "@/components/ui/premium-skeletons";
import { DepositFundsDialog } from "@/components/DepositFundsDialog";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet, Zap, Clock, Shield, ArrowDown, ArrowUp, Minus,
  Plus, Loader2, Banknote, TrendingUp, BarChart3, Sparkles, RefreshCw
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

  // Deposit modal state
  const [depositOpen, setDepositOpen] = useState(false);
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<ClientDateRange | null>({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
  const [datePreset, setDatePreset] = useState<ClientDatePreset>("today");
  const [isSyncing, setIsSyncing] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  // Fetch client name
  useEffect(() => {
    if (!effectiveClientId) return;
    supabase.from("profiles").select("full_name").eq("user_id", effectiveClientId).single()
      .then(({ data }) => { if (data?.full_name) setClientName(data.full_name); });
  }, [effectiveClientId]);

  const fetchAll = useCallback(async () => {
    if (!effectiveClientId) return;
    const [{ data: txData }, { data: accountLinks }] = await Promise.all([
      supabase.from("transactions").select("*").eq("client_id", effectiveClientId).order("date", { ascending: false }),
      supabase.from("ad_account_clients").select("ad_account_id").eq("client_id", effectiveClientId),
    ]);
    setTransactions((txData as Transaction[]) ?? []);

    const accIds = accountLinks?.map((a: any) => a.ad_account_id) ?? [];
    
    // Fetch ad accounts metadata
    if (accIds.length > 0) {
      const { data: accounts } = await supabase.from("ad_accounts").select("*").in("id", accIds);
      setAdAccounts(accounts ?? []);
      
      // Fetch spend from daily_metrics via campaigns
      const { data: campaigns } = await supabase.from("campaigns").select("id, ad_account_id, platform").in("ad_account_id", accIds);
      const campIds = campaigns?.map((c: any) => c.id) ?? [];
      if (campIds.length > 0) {
        const { data: metrics } = await supabase.from("daily_metrics").select("*").in("campaign_id", campIds).order("data_date", { ascending: false });
        // Enrich metrics with platform from campaign
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [effectiveClientId, fetchAll]);

  // Balance always uses ALL transactions (unfiltered)
  const credits = transactions.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
  const debits = transactions.filter((t) => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);
  const balance = credits - debits;

  // Per-platform sub-balances
  const platformBalances = useMemo(() => {
    const platforms = ["meta", "tiktok", "google"] as const;
    return platforms.map((p) => {
      const pCredits = transactions.filter((t) => t.type === "credit" && t.platform === p).reduce((s, t) => s + Number(t.amount), 0);
      const pDebits = transactions.filter((t) => t.type === "debit" && t.platform === p).reduce((s, t) => s + Number(t.amount), 0);
      return { platform: p, label: PLATFORM_LABELS[p], balance: pCredits - pDebits, color: PLATFORM_COLORS[p] };
    });
  }, [transactions]);
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

  // Filter out auto_spend transactions from display (they still count in balance)
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

  // Platform breakdown (filtered)
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

  const handleSyncNow = useCallback(async () => {
    if (lastSynced) {
      const lastSyncTime = new Date(lastSynced).getTime();
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      if (lastSyncTime > fiveMinAgo) {
        const minutesLeft = Math.ceil((lastSyncTime - fiveMinAgo) / 60000);
        toast({ title: "Data is up to date", description: `Please wait ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""} before syncing again.` });
        return;
      }
    }
    setIsSyncing(true);
    toast({ title: "Syncing...", description: "Fetching latest data." });
    try {
      const res = await supabase.functions.invoke("sync-fast-lane", { body: { client_id: effectiveClientId } });
      if (res.error) throw res.error;
      toast({ title: "Sync complete", description: "Your data has been refreshed." });
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  }, [lastSynced, toast, user]);

  if (loading) return <ShimmerLoader />;

  return (
    <div className="space-y-8 max-w-5xl mx-auto animate-fade-in">
      {/* Personalized Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-primary">{getGreeting()}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            {clientName ? `Welcome back, ${clientName.split(" ")[0]}` : "My Dashboard"}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            {lastSynced && (
              <span className="stat-pill">
                <Clock className="h-3 w-3" /> Last synced: {lastSynced}
              </span>
            )}
            {activeAccounts > 0 && (
              <span className="stat-pill">
                <span className="pulse-dot" /> {activeAccounts} Active Account{activeAccounts !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Now"}
          </Button>
          <Button
            onClick={() => setDepositOpen(true)}
            className="gap-2 h-11 px-6 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:-translate-y-0.5"
            size="lg"
          >
            <Plus className="h-4 w-4" /> Add Funds
          </Button>
        </div>
      </div>

      {/* Date Filter */}
      <ClientDateFilter onRangeChange={handleDateChange} activePreset={datePreset} />

      {/* Financial Overview Section */}
      <div>
        <div className="section-label">Financial Overview</div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {/* Balance Card - Hero */}
          <div className="glass-card glow-border p-6 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-foreground/15 backdrop-blur-sm">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-primary-foreground/70">Available Balance</p>
              </div>
            </div>
            <p className="text-4xl md:text-5xl font-bold font-mono count-up">{fmt(balance)}</p>
            <WalletHealthBar balance={balance} avgDailySpend={avgDailySpend} />
          </div>

          {/* Platform Sub-Balances */}
          <div className="sm:col-span-2 grid grid-cols-3 gap-3">
            {platformBalances.map((pb) => (
              <div key={pb.platform} className="glass-card glow-border p-4 flex flex-col items-center text-center">
                <span className="h-2.5 w-2.5 rounded-full mb-2" style={{ background: pb.color }} />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{pb.label}</p>
                <p className={cn("text-lg md:text-xl font-bold font-mono mt-1", pb.balance < 0 ? "text-destructive" : "")}>
                  {fmt(pb.balance)}
                </p>
              </div>
            ))}
          </div>

          {/* Spend Card */}
          <div className="glass-card glow-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent">
                <Zap className="h-6 w-6 text-accent-foreground" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {dateRange ? "Spend (Filtered)" : "Spend (30d)"}
                </p>
              </div>
            </div>
            <p className="text-4xl md:text-5xl font-bold font-mono">{fmt(currentTotalSpend)}</p>
            <GrowthIndicator current={currentTotalSpend} previous={prevTotalSpend} />
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Today: <span className="font-mono font-medium text-foreground">{fmt(todaySpend)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ad Performance Section */}
      {(platformData.length > 0 || user) && (
        <div>
          <div className="section-label">Ad Performance</div>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {/* Platform Donut */}
            {platformData.length > 0 && (
              <div className="glass-card glow-border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Platform Spend Split</h3>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={platformData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {platformData.map((entry) => <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform] || "#888"} />)}
                    </Pie>
                    <RTooltip formatter={(value: number) => fmt(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-2">
                  {platformData.map((p) => (
                    <div key={p.platform} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PLATFORM_COLORS[p.platform] || "#888" }} />
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
          <div className="p-6 pb-0 flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              Transaction History
              <Badge variant="secondary" className="text-[10px] font-normal">View Only</Badge>
            </h3>
          </div>
          <div className="p-6">
            {filteredTransactions.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No transactions for this period</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden sm:table-cell">Platform</TableHead>
                      <TableHead className="hidden md:table-cell">Description</TableHead>
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
                        <TableCell className="hidden sm:table-cell">{t.platform ? PLATFORM_LABELS[t.platform] : "—"}</TableCell>
                        <TableCell className="hidden md:table-cell">{t.description || "—"}</TableCell>
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
            )}
          </div>
        </div>
      </div>

      {/* Payment Requests */}
      {filteredPaymentRequests.length > 0 && (
        <div className="glass-card glow-border overflow-hidden">
          <div className="p-6 pb-0">
            <h3 className="font-semibold flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" /> Payment Requests
            </h3>
          </div>
          <div className="p-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount (BDT)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell text-right">Credited (USD)</TableHead>
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
                      <TableCell className="hidden md:table-cell text-right font-mono">
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
