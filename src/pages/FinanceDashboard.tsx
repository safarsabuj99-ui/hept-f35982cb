import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, Banknote, AlertTriangle } from "lucide-react";
import { DateRangeFilter, DateRange, DatePreset, toISODate } from "@/components/DateRangeFilter";

interface ClientProfit {
  name: string;
  totalSpendUsd: number;
  revenueBdt: number;
  cogsBdt: number;
  netProfit: number;
  margin: number;
}

export default function FinanceDashboard() {
  const [wac, setWac] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCogs, setTotalCogs] = useState(0);
  const [totalOpex, setTotalOpex] = useState(0);
  const [ownerDraw, setOwnerDraw] = useState(0);
  const [clientProfits, setClientProfits] = useState<ClientProfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [periodLabel, setPeriodLabel] = useState("All Time");

  const fetchAll = useCallback(async (range: DateRange | null) => {
    setLoading(true);

    // Build date-filtered queries
    let purchasesQuery = supabase.from("usd_purchases").select("bdt_amount_paid, usd_received, date");
    let spendQuery = supabase.from("daily_ad_spend").select("final_billable_usd, ad_account_id, campaign_name, date");
    let expensesQuery = supabase.from("agency_expenses").select("amount_bdt, category, date");

    if (range) {
      const from = toISODate(range.from);
      const to = toISODate(range.to);
      purchasesQuery = purchasesQuery.gte("date", from).lte("date", to);
      spendQuery = spendQuery.gte("date", from).lte("date", to);
      expensesQuery = expensesQuery.gte("date", from).lte("date", to);
    }

    const [purchasesRes, spendRes, profilesRes, rolesRes, expensesRes, settingsRes] = await Promise.all([
      purchasesQuery,
      spendQuery,
      supabase.from("profiles").select("user_id, full_name, pricing_config, custom_exchange_rate"),
      supabase.from("user_roles").select("user_id").eq("role", "client"),
      expensesQuery,
      supabase.from("settings").select("key, value").eq("key", "exchange_rate").maybeSingle(),
    ]);

    // WAC from filtered purchases
    const purchases = (purchasesRes.data as any[]) ?? [];
    let totalBdt = 0, totalUsd = 0;
    for (const p of purchases) { totalBdt += Number(p.bdt_amount_paid); totalUsd += Number(p.usd_received); }
    const calculatedWac = totalUsd > 0 ? Math.round((totalBdt / totalUsd) * 100) / 100 : 0;
    setWac(calculatedWac);

    const globalRate = settingsRes.data?.value ? Number(settingsRes.data.value) : 120;

    const { data: adAccounts } = await supabase.from("ad_accounts").select("id, client_id");
    const accToClient: Record<string, string> = {};
    for (const a of adAccounts ?? []) accToClient[a.id] = a.client_id;

    const clientIds = new Set((rolesRes.data ?? []).map((r: any) => r.user_id));
    const profileMap: Record<string, any> = {};
    for (const p of (profilesRes.data ?? []) as any[]) {
      if (clientIds.has(p.user_id)) profileMap[p.user_id] = p;
    }

    const clientSpend: Record<string, number> = {};
    for (const s of (spendRes.data ?? []) as any[]) {
      const cid = accToClient[s.ad_account_id];
      if (cid) clientSpend[cid] = (clientSpend[cid] || 0) + Number(s.final_billable_usd);
    }

    let aggRevenue = 0, aggCogs = 0;
    const profits: ClientProfit[] = [];
    for (const [cid, spendUsd] of Object.entries(clientSpend)) {
      const profile = profileMap[cid];
      if (!profile) continue;

      const pricingConfig = profile.pricing_config as any;
      let revenueBdt = 0;

      if (pricingConfig?.mode === "flat_rate") {
        const rates = pricingConfig.rates || {};
        const rateValues = Object.values(rates).map(Number).filter((v: number) => v > 0);
        const avgRate = rateValues.length > 0 ? rateValues.reduce((a: number, b: number) => a + b, 0) / rateValues.length : globalRate;
        revenueBdt = spendUsd * avgRate;
      } else if (pricingConfig?.mode === "percentage") {
        const markup = Number(pricingConfig.markup || 0) / 100;
        const marketRate = Number(profile.custom_exchange_rate) || globalRate;
        revenueBdt = spendUsd * marketRate * (1 + markup);
      } else {
        const rate = Number(profile.custom_exchange_rate) || globalRate;
        revenueBdt = spendUsd * rate;
      }

      const cogsBdt = spendUsd * calculatedWac;
      const profit = revenueBdt - cogsBdt;
      const margin = revenueBdt > 0 ? (profit / revenueBdt) * 100 : 0;

      aggRevenue += revenueBdt;
      aggCogs += cogsBdt;

      profits.push({
        name: profile.full_name,
        totalSpendUsd: Math.round(spendUsd * 100) / 100,
        revenueBdt: Math.round(revenueBdt),
        cogsBdt: Math.round(cogsBdt),
        netProfit: Math.round(profit),
        margin: Math.round(margin * 10) / 10,
      });
    }

    const expenses = (expensesRes.data as any[]) ?? [];
    const opex = expenses.filter(e => e.category !== "Owner_Draw").reduce((s: number, e: any) => s + Number(e.amount_bdt), 0);
    const draw = expenses.filter(e => e.category === "Owner_Draw").reduce((s: number, e: any) => s + Number(e.amount_bdt), 0);

    setTotalRevenue(Math.round(aggRevenue));
    setTotalCogs(Math.round(aggCogs));
    setTotalOpex(Math.round(opex));
    setOwnerDraw(Math.round(draw));
    setNetProfit(Math.round(aggRevenue - aggCogs - opex));
    setClientProfits(profits.sort((a, b) => b.netProfit - a.netProfit));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(dateRange); }, []);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finance Dashboard</h1>
          <p className="text-sm text-muted-foreground">Agency P&L, COGS, and client profitability</p>
        </div>
        <DateRangeFilter onRangeChange={handleRangeChange} />
      </div>

      {/* Main KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-success/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-success/10 p-2"><TrendingUp className="h-5 w-5 text-success" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Net Profit ({periodLabel})</p>
                {loading ? <Skeleton className="h-8 w-28" /> : (
                  <p className={`text-2xl font-bold font-mono ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                    ৳{netProfit.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2"><DollarSign className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Avg. Buying Cost ({periodLabel})</p>
                {loading ? <Skeleton className="h-8 w-24" /> : (
                  <p className="text-2xl font-bold font-mono">{wac} <span className="text-sm text-muted-foreground">BDT</span></p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-warning/10 p-2"><Banknote className="h-5 w-5 text-warning" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Owner's Draw ({periodLabel})</p>
                {loading ? <Skeleton className="h-8 w-24" /> : (
                  <p className="text-2xl font-bold font-mono">৳{ownerDraw.toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent p-2"><Banknote className="h-5 w-5 text-accent-foreground" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total OpEx ({periodLabel})</p>
                {loading ? <Skeleton className="h-8 w-24" /> : (
                  <p className="text-2xl font-bold font-mono">৳{totalOpex.toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">Profit & Loss Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total Revenue</p>
              {loading ? <Skeleton className="h-7 w-32 mx-auto" /> : (
                <p className="text-xl font-bold font-mono">৳{totalRevenue.toLocaleString()}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total COGS</p>
              {loading ? <Skeleton className="h-7 w-32 mx-auto" /> : (
                <p className="text-xl font-bold font-mono text-destructive">৳{totalCogs.toLocaleString()}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Gross Profit</p>
              {loading ? <Skeleton className="h-7 w-32 mx-auto" /> : (
                <p className={`text-xl font-bold font-mono ${(totalRevenue - totalCogs) >= 0 ? "text-success" : "text-destructive"}`}>
                  ৳{(totalRevenue - totalCogs).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client Profitability Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Client Profitability</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : clientProfits.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No spend data. Run a sync simulation first.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Spend (USD)</TableHead>
                    <TableHead className="text-right">Revenue (BDT)</TableHead>
                    <TableHead className="text-right">COGS (BDT)</TableHead>
                    <TableHead className="text-right">Profit (BDT)</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientProfits.map(c => (
                    <TableRow key={c.name}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right font-mono">${c.totalSpendUsd.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">৳{c.revenueBdt.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-destructive">৳{c.cogsBdt.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={c.netProfit >= 0 ? "text-success" : "text-destructive"}>
                          ৳{c.netProfit.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.margin < 5 ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> {c.margin}%
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{c.margin}%</Badge>
                        )}
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
