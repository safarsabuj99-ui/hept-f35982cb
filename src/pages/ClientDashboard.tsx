import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useDeepLinkAction } from "@/hooks/useDeepLinkAction";
import { getPlatformRates } from "@/lib/pricing";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { SpendTrendChart } from "@/components/SpendTrendChart";
import { ClientDateFilter, ClientDateRange, ClientDatePreset, getLocalTodayClient } from "@/components/ClientDateFilter";
import { getDhakaDateString } from "@/components/DateRangeFilter";
import { Progress } from "@/components/ui/progress";
import { DashboardSkeleton } from "@/components/ui/premium-skeletons";
import { DepositFundsDialog } from "@/components/DepositFundsDialog";
import {
  Wallet, Zap, Clock, Shield, Plus, TrendingUp, BarChart3,
  Sparkles, Activity, Layers
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { debounce } from "@/lib/debounce";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ClientNoticeBanner } from "@/components/ClientNoticeBanner";

const PLATFORM_COLORS: Record<string, string> = {
  meta: "hsl(var(--chart-meta))",
  tiktok: "hsl(var(--chart-tiktok))",
  google: "hsl(var(--chart-google))",
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

export default function ClientDashboard() {
  const { user } = useAuth();
  const { effectiveClientId } = useImpersonation();
  const { highlightId } = useDeepLinkAction();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [adSpend, setAdSpend] = useState<any[]>([]);
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [pricingConfig, setPricingConfig] = useState<any>(null);

  const [depositOpen, setDepositOpen] = useState(false);
  const [dateRange, setDateRange] = useState<ClientDateRange | null>(() => { const t = getLocalTodayClient(); return { from: t, to: t }; });
  const [datePreset, setDatePreset] = useState<ClientDatePreset>("today");

  const today = getDhakaDateString();

  useEffect(() => {
    if (!effectiveClientId) return;
    supabase.from("profiles").select("full_name, pricing_config").eq("user_id", effectiveClientId).single()
      .then(({ data }) => {
        if (data?.full_name) setClientName(data.full_name);
        if (data?.pricing_config) setPricingConfig(data.pricing_config);
      });
  }, [effectiveClientId]);

  const fetchAll = useCallback(async () => {
    if (!effectiveClientId) return;
    const [{ data: txData }, { data: accountLinks }] = await Promise.all([
      supabase.from("transactions").select("id, type, amount, platform, description, date, created_at, status").eq("client_id", effectiveClientId).eq("status", "completed").order("date", { ascending: false }),
      supabase.from("ad_account_clients").select("ad_account_id, mapping_keyword").eq("client_id", effectiveClientId).neq("mapping_keyword", ""),
    ]);
    setTransactions((txData as Transaction[]) ?? []);

    const accIds = accountLinks?.map((a: any) => a.ad_account_id) ?? [];
    if (accIds.length > 0) {
      const { data: accounts } = await supabase.from("ad_accounts").select("id, account_name, platform_name, is_active").in("id", accIds);
      setAdAccounts(accounts ?? []);
      const { data: campaigns } = await supabase.from("campaigns").select("id, ad_account_id, platform").in("ad_account_id", accIds).eq("client_id", effectiveClientId);
      const campIds = campaigns?.map((c: any) => c.id) ?? [];
      if (campIds.length > 0) {
        const { data: metrics } = await supabase.from("daily_metrics").select("campaign_id, data_date, spend, impressions, clicks, results, conversion_value, synced_at").in("campaign_id", campIds).order("data_date", { ascending: false });
        const enriched = (metrics ?? []).map((m: any) => {
          const camp = campaigns?.find((c: any) => c.id === m.campaign_id);
          return { ...m, ad_account_id: camp?.ad_account_id, platform_name: camp?.platform, date: m.data_date, final_billable_usd: m.spend };
        });
        setAdSpend(enriched);
        if (enriched[0]?.synced_at) setLastSynced(new Date(enriched[0].synced_at).toLocaleString());
      }
    }
    setLoading(false);
  }, [effectiveClientId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const { toast } = useToast();

  // Deep-link: show resumed toast
  useEffect(() => {
    if (highlightId === "resumed" && !loading) {
      toast({ title: "✅ Campaigns Resumed", description: "Your campaigns have been auto-resumed after balance top-up." });
    }
  }, [highlightId, loading]);

  useEffect(() => {
    if (!effectiveClientId) return;
    const channel = supabase
      .channel('client-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_metrics' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaigns' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [effectiveClientId, fetchAll]);

  const credits = transactions.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
  const debits = transactions.filter((t) => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);
  const balance = credits - debits;

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Calculate BDT balance using per-platform rates (works for both negative and positive)
  const balanceBdt = useMemo(() => {
    const flatRates = getPlatformRates(pricingConfig);
    const platforms = ["meta", "tiktok", "google"] as const;
    let totalBdt = 0;
    for (const p of platforms) {
      const pCredits = transactions.filter(t => t.type === "credit" && t.platform === p).reduce((s, t) => s + Number(t.amount), 0);
      const pDebits = transactions.filter(t => t.type === "debit" && t.platform === p).reduce((s, t) => s + Number(t.amount), 0);
      const pBalance = pCredits - pDebits;
      const rate = Number(flatRates[p]) || 120;
      totalBdt += pBalance * rate;
    }
    // Include untagged transactions with average rate
    const taggedPlatforms = transactions.filter(t => t.platform && ["meta", "tiktok", "google"].includes(t.platform));
    const untaggedCredits = transactions.filter(t => t.type === "credit" && (!t.platform || !["meta", "tiktok", "google"].includes(t.platform))).reduce((s, t) => s + Number(t.amount), 0);
    const untaggedDebits = transactions.filter(t => t.type === "debit" && (!t.platform || !["meta", "tiktok", "google"].includes(t.platform))).reduce((s, t) => s + Number(t.amount), 0);
    const untaggedBalance = untaggedCredits - untaggedDebits;
    if (untaggedBalance !== 0) {
      const avgRate = (flatRates.meta + flatRates.tiktok + flatRates.google) / 3;
      totalBdt += untaggedBalance * avgRate;
    }
    return totalBdt;
  }, [transactions, pricingConfig]);

  const handleDateChange = (range: ClientDateRange | null, p: ClientDatePreset) => {
    setDateRange(range);
    setDatePreset(p);
  };

  const filterByDate = useCallback((items: any[], dateField: string) => {
    if (!dateRange) return items;
    const fromStr = format(dateRange.from, "yyyy-MM-dd");
    const toStr = format(dateRange.to, "yyyy-MM-dd");
    return items.filter((item) => {
      const d = item[dateField]?.substring(0, 10);
      return d >= fromStr && d <= toStr;
    });
  }, [dateRange]);

  const filteredAdSpend = useMemo(() => filterByDate(adSpend, "date"), [adSpend, filterByDate]);

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
  const runwayDays = avgDailySpend > 0 ? Math.floor(balance / avgDailySpend) : balance > 0 ? 999 : 0;
  const activeAccounts = adAccounts.filter((a: any) => a.is_active).length;

  const platformSpend: Record<string, number> = {};
  for (const row of filteredAdSpend) {
    const acc = adAccounts.find((a: any) => a.id === row.ad_account_id);
    const platform = acc?.platform_name || "unknown";
    platformSpend[platform] = (platformSpend[platform] || 0) + Number(row.final_billable_usd);
  }
  const platformData = Object.entries(platformSpend)
    .map(([platform, value]) => ({ name: PLATFORM_LABELS[platform] || platform, value, platform }))
    .sort((a, b) => b.value - a.value);

  if (loading) return <DashboardSkeleton />;

  const kpis = [
    {
      icon: Zap, label: dateRange ? "Spend (Filtered)" : "Total Spend",
      value: fmt(currentTotalSpend), color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      icon: TrendingUp, label: "Today's Spend",
      value: fmt(todaySpend), color: "text-emerald-500",
      bgColor: "bg-emerald-500/10"
    },
    {
      icon: Layers, label: "Active Accounts",
      value: String(activeAccounts), color: "text-accent-foreground",
      bgColor: "bg-accent"
    },
    {
      icon: Activity, label: "Runway",
      value: runwayDays >= 999 ? "∞ days" : `${runwayDays} days`,
      color: runwayDays < 3 ? "text-destructive" : "text-emerald-500",
      bgColor: runwayDays < 3 ? "bg-destructive/10" : "bg-emerald-500/10"
    },
  ];

  return (
    <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto animate-fade-in">
      {/* Urgent Notices */}
      <ClientNoticeBanner clientId={effectiveClientId!} balance={balance} />

      {/* Hero Section */}
      <div className="client-hero-card p-5 md:p-8 rounded-2xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary-foreground/70" />
              <span className="text-xs font-medium text-primary-foreground/70 uppercase tracking-wider">{getGreeting()}</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-primary-foreground">
              {clientName ? `Welcome back, ${clientName.split(" ")[0]}` : "My Dashboard"}
            </h1>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {lastSynced && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] md:text-xs font-medium bg-primary-foreground/10 text-primary-foreground/80 backdrop-blur-sm">
                  <Clock className="h-3 w-3" /> Synced: {lastSynced}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end gap-3">
            {/* Balance display — glassmorphic inner card */}
            <div className="client-hero-balance-card px-5 py-3 rounded-xl">
              <p className="text-[10px] md:text-xs font-medium text-primary-foreground/60 uppercase tracking-wider mb-0.5">
                Available Balance
              </p>
              {balance < 0 ? (
                <>
              <p className="text-2xl md:text-4xl font-bold font-mono text-red-300 count-up">
                    -৳{Math.abs(balanceBdt).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-sm font-mono text-red-300 mt-0.5">
                    {fmt(balance)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl md:text-4xl font-bold font-mono text-primary-foreground count-up">
                    {fmt(balance)}
                  </p>
                  <p className="text-sm font-mono text-primary-foreground/70 mt-0.5">
                    ৳{balanceBdt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </>
              )}
            </div>
            <Button
              onClick={() => setDepositOpen(true)}
              variant="secondary"
              className="gap-2 h-10 md:h-11 px-6 font-semibold shadow-lg press-effect w-full md:w-auto"
              size="lg"
            >
              <Plus className="h-4 w-4" /> Add Funds
            </Button>
          </div>
        </div>
        <WalletHealthBar balance={balance} avgDailySpend={avgDailySpend} />
      </div>

      {/* Date Filter */}
      <ClientDateFilter onRangeChange={handleDateChange} activePreset={datePreset} />

      {/* KPI Strip */}
      <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1 md:grid md:grid-cols-4 md:overflow-visible md:pb-0">
        {kpis.map((kpi, i) => (
          <div
            key={kpi.label}
            className={cn(
              "glass-card glow-border p-4 md:p-5 min-w-[150px] snap-start shrink-0 md:min-w-0 md:shrink flex flex-col gap-3",
              `stagger-${i + 1}`
            )}
            style={{ animationFillMode: 'both' }}
          >
            <div className="flex items-center gap-2.5">
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", kpi.bgColor)}>
                <kpi.icon className={cn("h-4 w-4", kpi.color)} />
              </div>
              <span className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-wider leading-tight">
                {kpi.label}
              </span>
            </div>
            <p className="text-xl md:text-2xl font-bold font-mono count-up">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Two-Column Charts */}
      {(platformData.length > 0 || user) && (
        <div>
          <div className="section-label">Ad Performance</div>
          <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-2">
            {platformData.length > 0 && (
              <div className="glass-card glow-border p-4 md:p-6">
                <div className="flex items-center gap-2 mb-3 md:mb-4">
                  <BarChart3 className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                  <h3 className="font-semibold text-sm md:text-base">Platform Spend Split</h3>
                </div>
                <ResponsiveContainer width="100%" height={180} className="md:!h-[240px]">
                  <PieChart>
                    <Pie data={platformData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" nameKey="name"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {platformData.map((entry) => <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform] || "hsl(var(--muted))"} />)}
                    </Pie>
                    <RTooltip formatter={(value: number) => fmt(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-3 md:gap-4 mt-2 flex-wrap">
                  {platformData.map((p) => (
                    <div key={p.platform} className="flex items-center gap-1.5 text-[10px] md:text-xs text-muted-foreground">
                      <span className="h-2 w-2 md:h-2.5 md:w-2.5 rounded-full" style={{ background: PLATFORM_COLORS[p.platform] || "hsl(var(--muted))" }} />
                      {p.name}: <span className="font-mono font-medium text-foreground">{fmt(p.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {user && (
              <div className="glass-card glow-border overflow-hidden">
                <SpendTrendChart clientId={user.id} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      <DepositFundsDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        clientId={effectiveClientId ?? undefined}
        onSuccess={fetchAll}
      />
    </div>
  );
}
