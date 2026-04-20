import { useEffect, useState, useCallback, useRef } from "react";
import { getPlatformRates } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, Banknote, AlertTriangle, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { DateRangeFilter, DateRange, DatePreset, toISODate, getLocalToday } from "@/components/DateRangeFilter";
import { TableSkeleton } from "@/components/ui/premium-skeletons";
import { usePermissions } from "@/hooks/usePermissions";
import { debounce } from "@/lib/debounce";
import { fetchAllRows } from "@/lib/fetchAllRows";
interface ClientProfit {
  name: string;
  totalSpendUsd: number;
  revenueBdt: number;
  cogsBdt: number;
  netProfit: number;
  margin: number;
}

export default function FinanceDashboard() {
  const { hasPermission } = usePermissions();
  const canViewProfit = hasPermission("can_view_profit");
  const [wac, setWac] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCogs, setTotalCogs] = useState(0);
  const [totalOpex, setTotalOpex] = useState(0);
  const [ownerDraw, setOwnerDraw] = useState(0);
  const [takeHomeProfit, setTakeHomeProfit] = useState(0);
  const [endBalance, setEndBalance] = useState(0);
  const [startBalance, setStartBalance] = useState(0);
  const [balanceChange, setBalanceChange] = useState(0);
  const [clientProfits, setClientProfits] = useState<ClientProfit[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadingRef = useRef(true);
  const [dateRange, setDateRange] = useState<DateRange | null>(() => { const t = getLocalToday(); return { from: t, to: t }; });
  const [periodLabel, setPeriodLabel] = useState("Today");

  // Import premium skeletons

  const fetchAll = useCallback(async (range: DateRange | null) => {
    // Only show the page-level skeleton on the very first fetch.
    // Realtime invalidations and date-range changes refresh in the background.
    if (initialLoadingRef.current) setLoading(true);

    // Build paginated fetchers (bypass Supabase's silent 1000-row cap)
    const purchasesP = fetchAllRows<{ bdt_amount_paid: number; usd_received: number; date: string }>(() => {
      let q = supabase.from("usd_purchases").select("bdt_amount_paid, usd_received, date");
      if (range) {
        q = q.gte("date", toISODate(range.from)).lte("date", toISODate(range.to));
      }
      return q;
    });

    const expensesP = fetchAllRows<{ amount_bdt: number; category: string; date: string }>(() => {
      let q = supabase.from("agency_expenses").select("amount_bdt, category, date");
      if (range) {
        q = q.gte("date", toISODate(range.from)).lte("date", toISODate(range.to));
      }
      return q;
    });

    const profilesP = fetchAllRows<{ user_id: string; full_name: string; pricing_config: any }>(() =>
      supabase.from("profiles").select("user_id, full_name, pricing_config")
    );

    const rolesP = fetchAllRows<{ user_id: string }>(() =>
      supabase.from("user_roles").select("user_id").eq("role", "client")
    );

    const [purchasesData, profilesData, rolesData, expensesData] = await Promise.all([
      purchasesP, profilesP, rolesP, expensesP,
    ]);

    const calcWac = (data: any[] | null) => {
      let bdt = 0, usd = 0;
      for (const p of (data ?? [])) { bdt += Number(p.bdt_amount_paid); usd += Number(p.usd_received); }
      return usd > 0 ? Math.round((bdt / usd) * 100) / 100 : 0;
    };

    let calculatedWac = calcWac(purchasesData);

    if (calculatedWac === 0) {
      const today = getLocalToday();
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthPurchases = await fetchAllRows<{ bdt_amount_paid: number; usd_received: number }>(() =>
        supabase.from("usd_purchases")
          .select("bdt_amount_paid, usd_received")
          .gte("date", toISODate(firstOfMonth))
          .lte("date", toISODate(today))
      );
      calculatedWac = calcWac(monthPurchases);
    }

    if (calculatedWac === 0) {
      const allPurchases = await fetchAllRows<{ bdt_amount_paid: number; usd_received: number }>(() =>
        supabase.from("usd_purchases").select("bdt_amount_paid, usd_received")
      );
      calculatedWac = calcWac(allPurchases);
    }

    setWac(calculatedWac);

    const clientIds = new Set(rolesData.map((r: any) => r.user_id));
    const profileMap: Record<string, any> = {};
    for (const p of profilesData) {
      if (clientIds.has(p.user_id)) profileMap[p.user_id] = p;
    }

    const allCampaigns = await fetchAllRows<{ id: string; ad_account_id: string; platform: string; client_id: string | null }>(() =>
      supabase.from("campaigns").select("id, ad_account_id, platform, client_id")
    );

    if (!allCampaigns.length) {
      setLoading(false);
      initialLoadingRef.current = false;
      return;
    }

    const campaignToPlatform: Record<string, string> = {};
    const campaignToClient: Record<string, string> = {};
    for (const c of allCampaigns) {
      campaignToPlatform[c.id] = c.platform;
      if (c.client_id) campaignToClient[c.id] = c.client_id;
    }

    const metricsData = await fetchAllRows<{ campaign_id: string; spend: number; data_date: string }>(() => {
      let q = supabase.from("daily_metrics").select("campaign_id, spend, data_date");
      if (range) {
        q = q.gte("data_date", toISODate(range.from)).lte("data_date", toISODate(range.to));
      }
      return q;
    });

    const clientPlatformSpend: Record<string, Record<string, number>> = {};
    for (const m of (metricsData ?? []) as any[]) {
      const clientId = campaignToClient[m.campaign_id];
      if (!clientId) continue;
      const platform = campaignToPlatform[m.campaign_id] || "meta";
      if (!clientPlatformSpend[clientId]) clientPlatformSpend[clientId] = {};
      clientPlatformSpend[clientId][platform] = (clientPlatformSpend[clientId][platform] || 0) + Number(m.spend);
    }

    let aggRevenue = 0, aggCogs = 0;
    const profits: ClientProfit[] = [];
    for (const [cid, platformSpends] of Object.entries(clientPlatformSpend)) {
      const profile = profileMap[cid];
      if (!profile) continue;

      const pricingConfig = profile.pricing_config as any;
      const platformRates = getPlatformRates(pricingConfig);
      const percentageMarkup = Number(pricingConfig?.percentage || 0);

      let revenueBdt = 0;
      let totalSpendUsd = 0;

      for (const [platform, spendUsd] of Object.entries(platformSpends)) {
        const rate = Number(platformRates[platform] || 120);
        revenueBdt += (spendUsd as number) * rate;
        totalSpendUsd += spendUsd as number;
      }

      if (percentageMarkup > 0) {
        revenueBdt += totalSpendUsd * (percentageMarkup / 100) * (platformRates.meta || 120);
      }

      const cogsBdt = totalSpendUsd * calculatedWac;
      const profit = revenueBdt - cogsBdt;
      const margin = revenueBdt > 0 ? (profit / revenueBdt) * 100 : 0;

      aggRevenue += revenueBdt;
      aggCogs += cogsBdt;

      profits.push({
        name: profile.full_name,
        totalSpendUsd: Math.round(totalSpendUsd * 100) / 100,
        revenueBdt: Math.round(revenueBdt),
        cogsBdt: Math.round(cogsBdt),
        netProfit: Math.round(profit),
        margin: Math.round(margin * 10) / 10,
      });
    }

    const expenses = expensesData;
    const opex = expenses.filter(e => e.category !== "Owner_Draw").reduce((s: number, e: any) => s + Number(e.amount_bdt), 0);
    const draw = expenses.filter(e => e.category === "Owner_Draw").reduce((s: number, e: any) => s + Number(e.amount_bdt), 0);

    // ===== Balance Change calculation =====
    // End balance = current sum of active agency_accounts.
    // Start balance = end - net cash delta within the period.
    // Sources of agency BDT cash movement:
    //   INFLOWS:  liquid_fund_entries (BDT received, e.g. client deposits/loans),
    //             cash_withdrawal_returns (returned cash flows back into accounts)
    //   OUTFLOWS: agency_expenses (opex + owner_draw),
    //             usd_purchases.bdt_amount_paid (BDT spent buying USD),
    //             cash_withdrawals (cash taken out of accounts)
    //   fund_transfers are internal A→A moves, net zero on total balance.
    const accountsP = supabase.from("agency_accounts").select("current_balance_bdt").eq("is_active", true);
    const isoFrom = range ? toISODate(range.from) : null;
    const isoTo = range ? toISODate(range.to) : null;

    const liquidInP = fetchAllRows<{ amount_bdt: number }>(() => {
      let q = supabase.from("liquid_fund_entries").select("amount_bdt, type, date").eq("type", "inflow");
      if (range) q = q.gte("date", isoFrom!).lte("date", isoTo!);
      return q;
    });
    const withdrawalsP = fetchAllRows<{ amount_bdt: number }>(() => {
      let q = supabase.from("cash_withdrawals").select("amount_bdt, date");
      if (range) q = q.gte("date", isoFrom!).lte("date", isoTo!);
      return q;
    });
    const withdrawalReturnsP = fetchAllRows<{ amount_bdt: number }>(() => {
      let q = supabase.from("cash_withdrawal_returns").select("amount_bdt, date");
      if (range) q = q.gte("date", isoFrom!).lte("date", isoTo!);
      return q;
    });
    const usdPurchaseSpendP = fetchAllRows<{ bdt_amount_paid: number }>(() => {
      let q = supabase.from("usd_purchases").select("bdt_amount_paid, date");
      if (range) q = q.gte("date", isoFrom!).lte("date", isoTo!);
      return q;
    });

    const [{ data: accountsData }, liquidIn, withdrawals, wReturns, usdPurchSpend] = await Promise.all([
      accountsP, liquidInP, withdrawalsP, withdrawalReturnsP, usdPurchaseSpendP,
    ]);

    const sum = (arr: any[], key: string) => arr.reduce((s, r) => s + Number(r[key] || 0), 0);
    const currentEnd = (accountsData ?? []).reduce((s: number, a: any) => s + Number(a.current_balance_bdt || 0), 0);
    const inflows = sum(liquidIn, "amount_bdt") + sum(wReturns, "amount_bdt");
    const outflows = sum(withdrawals, "amount_bdt")
      + sum(usdPurchSpend, "bdt_amount_paid")
      + opex + draw;
    const netDelta = inflows - outflows;
    const periodStart = currentEnd - netDelta;

    setEndBalance(Math.round(currentEnd));
    setStartBalance(Math.round(periodStart));
    setBalanceChange(Math.round(netDelta));

    setTotalRevenue(Math.round(aggRevenue));
    setTotalCogs(Math.round(aggCogs));
    setTotalOpex(Math.round(opex));
    setOwnerDraw(Math.round(draw));
    const np = aggRevenue - aggCogs - opex;
    setNetProfit(Math.round(np));
    setTakeHomeProfit(Math.round(np - draw));
    setClientProfits(profits.sort((a, b) => b.netProfit - a.netProfit));
    setLoading(false);
    initialLoadingRef.current = false;
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

  return (
    <div className="space-y-6">
      <div className="flex justify-end animate-slide-up-fade">
        <DateRangeFilter onRangeChange={handleRangeChange} />
      </div>

      {/* P&L Waterfall — 6-card flow: Revenue → COGS → Gross → OpEx → Draw → Take-Home */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 opacity-0 animate-slide-up-fade stagger-2">
        {/* 1. Revenue */}
        <div className="glass-card glow-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="hidden sm:block rounded-lg bg-primary/10 p-2"><DollarSign className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Total Revenue ({periodLabel})</p>
                {loading ? <Skeleton className="h-8 w-28" /> : (
                  <p className="text-xl sm:text-2xl font-bold font-mono">৳{totalRevenue.toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </div>
        {/* 2. COGS */}
        <div className="glass-card glow-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="hidden sm:block rounded-lg bg-destructive/10 p-2"><ArrowDownRight className="h-5 w-5 text-destructive" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Total COGS ({periodLabel})</p>
                {loading ? <Skeleton className="h-8 w-28" /> : (
                  <p className="text-xl sm:text-2xl font-bold font-mono text-destructive">৳{totalCogs.toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </div>
        {/* 3. Gross Profit */}
        <div className="glass-card glow-border border-success/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="hidden sm:block rounded-lg bg-success/10 p-2"><TrendingUp className="h-5 w-5 text-success" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Gross Profit ({periodLabel})</p>
                {loading ? <Skeleton className="h-8 w-28" /> : (
                  <p className={`text-xl sm:text-2xl font-bold font-mono ${(totalRevenue - totalCogs) >= 0 ? "text-success" : "text-destructive"}`}>
                    ৳{(totalRevenue - totalCogs).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </div>
        {/* 4. OpEx */}
        <div className="glass-card glow-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="hidden sm:block rounded-lg bg-accent p-2"><Banknote className="h-5 w-5 text-accent-foreground" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Total OpEx ({periodLabel})</p>
                {loading ? <Skeleton className="h-8 w-24" /> : (
                  <p className="text-xl sm:text-2xl font-bold font-mono">৳{totalOpex.toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </div>
        {/* 5. Net Profit (business profit, before owner draw) */}
        {canViewProfit && (
          <div className="glass-card glow-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="hidden sm:block rounded-lg bg-success/10 p-2"><TrendingUp className="h-5 w-5 text-success" /></div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">Net Profit ({periodLabel})</p>
                  {loading ? <Skeleton className="h-8 w-28" /> : (
                    <p className={`text-xl sm:text-2xl font-bold font-mono ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                      ৳{netProfit.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </div>
        )}
        {/* 6. Owner's Draw */}
        <div className="glass-card glow-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="hidden sm:block rounded-lg bg-warning/10 p-2"><Banknote className="h-5 w-5 text-warning" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Owner's Draw ({periodLabel})</p>
                {loading ? <Skeleton className="h-8 w-24" /> : (
                  <p className="text-xl sm:text-2xl font-bold font-mono">৳{ownerDraw.toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </div>
        {/* 6. Take-Home Profit */}
        {canViewProfit && (
          <div className="glass-card glow-border border-success/30">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="hidden sm:block rounded-lg bg-success/10 p-2"><Wallet className="h-5 w-5 text-success" /></div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">Take-Home Profit ({periodLabel})</p>
                  {loading ? <Skeleton className="h-8 w-28" /> : (
                    <p className={`text-xl sm:text-2xl font-bold font-mono ${takeHomeProfit >= 0 ? "text-success" : "text-destructive"}`}>
                      ৳{takeHomeProfit.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </div>
        )}
      </div>

      {/* Secondary KPIs: Avg Cost + Balance Change */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 opacity-0 animate-slide-up-fade stagger-3">
        <div className="glass-card glow-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="hidden sm:block rounded-lg bg-primary/10 p-2"><DollarSign className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Avg. Cost ({periodLabel})</p>
                {loading ? <Skeleton className="h-8 w-24" /> : (
                  <p className="text-xl sm:text-2xl font-bold font-mono">{wac} <span className="text-sm text-muted-foreground">BDT/USD</span></p>
                )}
              </div>
            </div>
          </CardContent>
        </div>
        <div className={`glass-card glow-border ${balanceChange >= 0 ? "border-success/20" : "border-destructive/20"}`}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`hidden sm:block rounded-lg p-2 ${balanceChange >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                {balanceChange >= 0
                  ? <ArrowUpRight className="h-5 w-5 text-success" />
                  : <ArrowDownRight className="h-5 w-5 text-destructive" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground truncate">Balance Change ({periodLabel})</p>
                {loading ? <Skeleton className="h-8 w-32" /> : (
                  <>
                    <p className={`text-xl sm:text-2xl font-bold font-mono ${balanceChange >= 0 ? "text-success" : "text-destructive"}`}>
                      {balanceChange >= 0 ? "+" : ""}৳{balanceChange.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-muted-foreground/80 mt-1 font-mono truncate">
                      Start: ৳{startBalance.toLocaleString()} → End: ৳{endBalance.toLocaleString()}
                    </p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </div>
      </div>

      {/* P&L Summary */}
      {canViewProfit && (
        <div className="glass-card glow-border opacity-0 animate-slide-up-fade stagger-3">
          <CardHeader><CardTitle className="text-base">Profit & Loss Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 text-center">
              <div className="py-2">
                <p className="text-xs text-muted-foreground mb-1">Revenue</p>
                {loading ? <Skeleton className="h-7 w-24 mx-auto" /> : (
                  <p className="text-base sm:text-lg font-bold font-mono">৳{totalRevenue.toLocaleString()}</p>
                )}
              </div>
              <div className="py-2">
                <p className="text-xs text-muted-foreground mb-1">− COGS</p>
                {loading ? <Skeleton className="h-7 w-24 mx-auto" /> : (
                  <p className="text-base sm:text-lg font-bold font-mono text-destructive">৳{totalCogs.toLocaleString()}</p>
                )}
              </div>
              <div className="py-2">
                <p className="text-xs text-muted-foreground mb-1">= Gross Profit</p>
                {loading ? <Skeleton className="h-7 w-24 mx-auto" /> : (
                  <p className={`text-base sm:text-lg font-bold font-mono ${(totalRevenue - totalCogs) >= 0 ? "text-success" : "text-destructive"}`}>
                    ৳{(totalRevenue - totalCogs).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="py-2">
                <p className="text-xs text-muted-foreground mb-1">− OpEx</p>
                {loading ? <Skeleton className="h-7 w-24 mx-auto" /> : (
                  <p className="text-base sm:text-lg font-bold font-mono text-destructive">৳{totalOpex.toLocaleString()}</p>
                )}
              </div>
              <div className="py-2">
                <p className="text-xs text-muted-foreground mb-1">= Net Profit</p>
                {loading ? <Skeleton className="h-7 w-24 mx-auto" /> : (
                  <p className={`text-base sm:text-lg font-bold font-mono ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                    ৳{netProfit.toLocaleString()}
                  </p>
                )}
              </div>
              <div className="py-2">
                <p className="text-xs text-muted-foreground mb-1">− Owner's Draw</p>
                {loading ? <Skeleton className="h-7 w-24 mx-auto" /> : (
                  <p className="text-base sm:text-lg font-bold font-mono text-warning">৳{ownerDraw.toLocaleString()}</p>
                )}
              </div>
              <div className="py-2 rounded-lg bg-success/5">
                <p className="text-xs text-muted-foreground mb-1">= Take-Home</p>
                {loading ? <Skeleton className="h-7 w-24 mx-auto" /> : (
                  <p className={`text-base sm:text-lg font-bold font-mono ${takeHomeProfit >= 0 ? "text-success" : "text-destructive"}`}>
                    ৳{takeHomeProfit.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </div>
      )}

      {/* Client Profitability */}
      <div className="glass-card glow-border opacity-0 animate-slide-up-fade stagger-4">
        <CardHeader><CardTitle className="text-base">Client Profitability</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={4} columns={6} />
          ) : clientProfits.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No spend data. Run a sync simulation first.</p>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="flex flex-col gap-3 md:hidden">
                {clientProfits.map(c => (
                  <div key={c.name} className="rounded-xl border p-4 space-y-3 bg-card">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.name}</span>
                      {canViewProfit && (c.margin < 5 ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> {c.margin}%
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{c.margin}%</Badge>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Spend (USD)</p>
                        <p className="font-mono font-medium">${c.totalSpendUsd.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Revenue (BDT)</p>
                        <p className="font-mono font-medium">৳{c.revenueBdt.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">COGS (BDT)</p>
                        <p className="font-mono font-medium text-destructive">৳{c.cogsBdt.toLocaleString()}</p>
                      </div>
                      {canViewProfit && (
                        <div>
                          <p className="text-xs text-muted-foreground">Profit (BDT)</p>
                          <p className={`font-mono font-medium ${c.netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                            ৳{c.netProfit.toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground/60">Client</TableHead>
                      <TableHead className="text-right text-[11px] uppercase tracking-widest text-muted-foreground/60">Spend (USD)</TableHead>
                      <TableHead className="text-right text-[11px] uppercase tracking-widest text-muted-foreground/60">Revenue (BDT)</TableHead>
                      <TableHead className="text-right text-[11px] uppercase tracking-widest text-muted-foreground/60">COGS (BDT)</TableHead>
                      {canViewProfit && <TableHead className="text-right text-[11px] uppercase tracking-widest text-muted-foreground/60">Profit (BDT)</TableHead>}
                      {canViewProfit && <TableHead className="text-right text-[11px] uppercase tracking-widest text-muted-foreground/60">Margin</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientProfits.map(c => (
                      <TableRow key={c.name}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right font-mono">${c.totalSpendUsd.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">৳{c.revenueBdt.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-destructive">৳{c.cogsBdt.toLocaleString()}</TableCell>
                        {canViewProfit && (
                          <TableCell className="text-right font-mono">
                            <span className={c.netProfit >= 0 ? "text-success" : "text-destructive"}>
                              ৳{c.netProfit.toLocaleString()}
                            </span>
                          </TableCell>
                        )}
                        {canViewProfit && (
                          <TableCell className="text-right">
                            {c.margin < 5 ? (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="h-3 w-3" /> {c.margin}%
                              </Badge>
                            ) : (
                              <Badge variant="secondary">{c.margin}%</Badge>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </div>
    </div>
  );
}
