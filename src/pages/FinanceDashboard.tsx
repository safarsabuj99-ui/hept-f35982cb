import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DollarSign, Banknote, ArrowDownRight, TrendingUp, Wallet, ArrowUpRight } from "lucide-react";
import { DateRangeFilter, DateRange, DatePreset, getLocalToday } from "@/components/DateRangeFilter";
import { usePermissions } from "@/hooks/usePermissions";
import { debounce } from "@/lib/debounce";
import {
  aggregateFinance, fetchDailySeries, getPreviousRange,
  FinanceAggregate, DailyPoint,
} from "@/lib/finance/aggregate";
import { buildInsights, Insight } from "@/lib/finance/insights";
import { PnlHero } from "@/components/finance/PnlHero";
import { PnlKpiRow } from "@/components/finance/PnlKpiRow";
import { PnlInsights } from "@/components/finance/PnlInsights";
import { PnlTrendChart } from "@/components/finance/PnlTrendChart";
import { ClientProfitTable } from "@/components/finance/ClientProfitTable";

export default function FinanceDashboard() {
  const { hasPermission } = usePermissions();
  const canViewProfit = hasPermission("can_view_profit");

  const [current, setCurrent] = useState<FinanceAggregate | null>(null);
  const [previous, setPrevious] = useState<FinanceAggregate | null>(null);
  const [series, setSeries] = useState<DailyPoint[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const initialRef = useRef(true);

  const [dateRange, setDateRange] = useState<DateRange | null>(() => { const t = getLocalToday(); return { from: t, to: t }; });
  const [periodLabel, setPeriodLabel] = useState("Today");

  // Optional secondary KPIs (kept from original)
  const [endBalance, setEndBalance] = useState(0);
  const [startBalance, setStartBalance] = useState(0);
  const [balanceChange, setBalanceChange] = useState(0);

  const fetchAll = useCallback(async (range: DateRange | null) => {
    if (initialRef.current) setLoading(true);

    const prevRange = getPreviousRange(range);
    const [cur, prev, dailySeries] = await Promise.all([
      aggregateFinance(range),
      prevRange ? aggregateFinance(prevRange) : Promise.resolve<FinanceAggregate | null>(null),
      fetchDailySeries(30),
    ]);

    setCurrent(cur);
    setPrevious(prev);
    setSeries(dailySeries);
    setInsights(buildInsights({ current: cur, previous: prev, prevWac: prev?.wac ?? null }));

    // Balance change (secondary)
    const { data: accountsData } = await supabase.from("agency_accounts").select("current_balance_bdt").eq("is_active", true);
    const currentEnd = (accountsData ?? []).reduce((s: number, a: any) => s + Number(a.current_balance_bdt || 0), 0);
    setEndBalance(Math.round(currentEnd));
    setStartBalance(Math.round(currentEnd));
    setBalanceChange(0);

    setLoading(false);
    initialRef.current = false;
  }, []);

  useEffect(() => { fetchAll(dateRange); }, []);

  useEffect(() => {
    const debounced = debounce(() => fetchAll(dateRange), 1500);
    const channel = supabase
      .channel("finance-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_ad_spend" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "usd_purchases" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "agency_expenses" }, debounced)
      .subscribe();
    return () => { debounced.cancel(); supabase.removeChannel(channel); };
  }, [fetchAll, dateRange]);

  const handleRangeChange = (range: DateRange | null, preset: DatePreset) => {
    setDateRange(range);
    const labels: Record<DatePreset, string> = {
      all_time: "All Time", today: "Today", yesterday: "Yesterday", this_week: "This Week",
      last_week: "Last Week", this_month: "This Month", last_month: "Last Month", custom: "Custom Range",
    };
    setPeriodLabel(labels[preset]);
    fetchAll(range);
  };

  const c = current ?? { revenue: 0, cogs: 0, opex: 0, draw: 0, grossProfit: 0, netProfit: 0, takeHome: 0, margin: 0, wac: 0, clients: [] };

  return (
    <div className="space-y-6">
      <div className="flex justify-end animate-slide-up-fade">
        <DateRangeFilter onRangeChange={handleRangeChange} />
      </div>

      {/* HERO */}
      {canViewProfit && (
        <div className="opacity-0 animate-slide-up-fade stagger-1">
          <PnlHero
            takeHome={c.takeHome}
            takeHomePrev={previous?.takeHome ?? null}
            series={series}
            loading={loading}
            periodLabel={periodLabel}
          />
        </div>
      )}

      {/* KPI ROW */}
      <div className="opacity-0 animate-slide-up-fade stagger-2">
        <PnlKpiRow
          current={{ revenue: c.revenue, grossProfit: c.grossProfit, netProfit: c.netProfit, margin: c.margin }}
          previous={previous ? { revenue: previous.revenue, grossProfit: previous.grossProfit, netProfit: previous.netProfit, margin: previous.margin } : null}
          loading={loading}
        />
      </div>

      {/* INSIGHTS */}
      {canViewProfit && !loading && insights.length > 0 && (
        <div className="opacity-0 animate-slide-up-fade stagger-3">
          <PnlInsights insights={insights} />
        </div>
      )}

      {/* Secondary mini-strip: WAC + balance */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 opacity-0 animate-slide-up-fade stagger-3">
        <div className="glass-card glow-border">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="hidden sm:block rounded-lg bg-primary/10 p-2"><DollarSign className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Avg. Cost (WAC)</p>
                {loading ? <Skeleton className="h-7 w-24" /> : (
                  <p className="text-xl font-bold font-mono">{c.wac} <span className="text-xs text-muted-foreground">BDT/USD</span></p>
                )}
              </div>
            </div>
          </CardContent>
        </div>
        <div className="glass-card glow-border">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="hidden sm:block rounded-lg bg-success/10 p-2"><Wallet className="h-5 w-5 text-success" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Current Agency Balance</p>
                {loading ? <Skeleton className="h-7 w-32" /> : (
                  <p className="text-xl font-bold font-mono">৳{endBalance.toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </div>
      </div>

      {/* TABS */}
      <Tabs defaultValue="waterfall" className="opacity-0 animate-slide-up-fade stagger-4">
        <TabsList>
          <TabsTrigger value="waterfall">Waterfall</TabsTrigger>
          <TabsTrigger value="trend">30-Day Trend</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
        </TabsList>

        <TabsContent value="waterfall" className="mt-4">
          {canViewProfit && (
            <div className="glass-card glow-border">
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 text-center">
                  <Step label="Revenue" value={c.revenue} />
                  <Step label="− COGS" value={c.cogs} tone="destructive" />
                  <Step label="= Gross Profit" value={c.grossProfit} tone={c.grossProfit >= 0 ? "success" : "destructive"} />
                  <Step label="− OpEx" value={c.opex} tone="destructive" />
                  <Step label="= Net Profit" value={c.netProfit} tone={c.netProfit >= 0 ? "success" : "destructive"} />
                  <Step label="− Owner's Draw" value={c.draw} tone="warning" />
                  <Step label="= Take-Home" value={c.takeHome} tone={c.takeHome >= 0 ? "success" : "destructive"} highlight />
                </div>
              </CardContent>
            </div>
          )}
        </TabsContent>

        <TabsContent value="trend" className="mt-4">
          <PnlTrendChart data={series} />
        </TabsContent>

        <TabsContent value="clients" className="mt-4">
          <ClientProfitTable clients={c.clients} canViewProfit={canViewProfit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Step({ label, value, tone, highlight }: { label: string; value: number; tone?: "success" | "destructive" | "warning"; highlight?: boolean }) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "";
  return (
    <div className={`py-2 ${highlight ? "rounded-lg bg-success/5" : ""}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-base sm:text-lg font-bold font-mono ${color}`}>৳{value.toLocaleString()}</p>
    </div>
  );
}
