import { useEffect, useState } from "react";
import { getPlatformRates } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClientDateFilter, type ClientDateRange, type ClientDatePreset, getLocalTodayClient } from "@/components/ClientDateFilter";
import { format } from "date-fns";
import { usePermissions } from "@/hooks/usePermissions";

interface PlatformProfit {
  platform: string;
  spendUsd: number;
  billingRate: number;
  wac: number;
  gap: number;
  profitBdt: number;
  marginPct: number;
}

interface ClientProfitTabProps {
  clientId: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  google: "Google",
};

const PLATFORM_COLORS: Record<string, string> = {
  meta: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  tiktok: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  google: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

export function ClientProfitTab({ clientId }: ClientProfitTabProps) {
  const { hasPermission } = usePermissions();
  const canViewProfit = hasPermission("can_view_profit");
  const [rows, setRows] = useState<PlatformProfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<ClientDateRange | null>(() => { const t = getLocalTodayClient(); return { from: t, to: t }; });
  const [datePreset, setDatePreset] = useState<ClientDatePreset>("today");

  useEffect(() => {
    fetchData(dateRange);
  }, [clientId]);

  const handleDateChange = (range: ClientDateRange | null, preset: ClientDatePreset) => {
    setDateRange(range);
    setDatePreset(preset);
    fetchData(range);
  };

  const fetchData = async (range: ClientDateRange | null) => {
    setLoading(true);

    const [purchasesRes, profileRes, accClientsRes, campaignsRes] = await Promise.all([
      supabase.from("usd_purchases").select("bdt_amount_paid, usd_received"),
      supabase.from("profiles").select("pricing_config").eq("user_id", clientId).single(),
      supabase.from("ad_account_clients").select("ad_account_id").eq("client_id", clientId),
      supabase.from("campaigns").select("id, ad_account_id, platform").eq("client_id", clientId),
    ]);

    // WAC with cascading fallback
    const calcWac = (data: any[] | null) => {
      let bdt = 0, usd = 0;
      for (const p of (data ?? [])) { bdt += Number(p.bdt_amount_paid); usd += Number(p.usd_received); }
      return usd > 0 ? bdt / usd : 0;
    };

    let rangePurchases = purchasesRes.data as any[] | null;
    if (range) {
      const { data: filtered } = await supabase.from("usd_purchases")
        .select("bdt_amount_paid, usd_received")
        .gte("date", format(range.from, "yyyy-MM-dd"))
        .lte("date", format(range.to, "yyyy-MM-dd"));
      rangePurchases = filtered;
    }
    let wac = calcWac(rangePurchases);

    if (wac === 0) {
      const today = new Date();
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const { data: monthPurchases } = await supabase.from("usd_purchases")
        .select("bdt_amount_paid, usd_received")
        .gte("date", format(firstOfMonth, "yyyy-MM-dd"))
        .lte("date", format(today, "yyyy-MM-dd"));
      wac = calcWac(monthPurchases);
    }

    if (wac === 0) {
      wac = calcWac(purchasesRes.data);
    }

    // Client's billing rates
    const pricingConfig = (profileRes.data?.pricing_config as any) || {};
    const rates = getPlatformRates(pricingConfig);

    // Client's ad account IDs
    const clientAccIds = new Set((accClientsRes.data ?? []).map((a: any) => a.ad_account_id));

    // Campaigns belonging to client's ad accounts
    const campaignMap: Record<string, string> = {};
    const campaignIds: string[] = [];
    for (const c of (campaignsRes.data ?? []) as any[]) {
      if (clientAccIds.has(c.ad_account_id)) {
        campaignMap[c.id] = c.platform;
        campaignIds.push(c.id);
      }
    }

    if (campaignIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // Fetch metrics with date filter
    let metricsQuery = supabase
      .from("daily_metrics")
      .select("campaign_id, spend")
      .in("campaign_id", campaignIds);

    if (range) {
      metricsQuery = metricsQuery
        .gte("data_date", format(range.from, "yyyy-MM-dd"))
        .lte("data_date", format(range.to, "yyyy-MM-dd"));
    }

    const metricsRes = await metricsQuery;

    // Aggregate spend per platform
    const platformSpend: Record<string, number> = {};
    for (const m of (metricsRes.data ?? []) as any[]) {
      const platform = campaignMap[m.campaign_id];
      if (!platform) continue;
      platformSpend[platform] = (platformSpend[platform] || 0) + Number(m.spend);
    }

    // Build rows
    const result: PlatformProfit[] = [];
    for (const platform of ["meta", "tiktok", "google"]) {
      const spendUsd = platformSpend[platform] || 0;
      if (spendUsd === 0) continue;
      const billingRate = Number(rates[platform] || 120);
      const gap = billingRate - wac;
      const profitBdt = spendUsd * gap;
      const revenueBdt = spendUsd * billingRate;
      const marginPct = revenueBdt > 0 ? (profitBdt / revenueBdt) * 100 : 0;

      result.push({
        platform,
        spendUsd: Math.round(spendUsd * 100) / 100,
        billingRate: Math.round(billingRate * 100) / 100,
        wac: Math.round(wac * 100) / 100,
        gap: Math.round(gap * 100) / 100,
        profitBdt: Math.round(profitBdt),
        marginPct: Math.round(marginPct * 10) / 10,
      });
    }

    setRows(result);
    setLoading(false);
  };

  const totalSpend = rows.reduce((s, r) => s + r.spendUsd, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profitBdt, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.spendUsd * r.billingRate, 0);
  const totalMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  if (!canViewProfit) {
    return (
      <Card><CardContent className="py-8"><p className="text-sm text-muted-foreground text-center">You don't have permission to view profit data.</p></CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Date Filter */}
      <ClientDateFilter onRangeChange={handleDateChange} activePreset={datePreset} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground text-center">No spend data available for this period.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Platform Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            {rows.map((r) => (
              <Card key={r.platform} className="dark:bg-card/80">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={`text-xs font-medium ${PLATFORM_COLORS[r.platform] || ""}`}>
                      {PLATFORM_LABELS[r.platform] || r.platform}
                    </Badge>
                    <Badge variant={r.profitBdt >= 0 ? "default" : "destructive"} className="text-xs">
                      {r.marginPct >= 0 ? "+" : ""}{r.marginPct}%
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-2xl font-bold font-mono">
                    ৳{r.profitBdt.toLocaleString()}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">Spend</span>
                      <span className="font-mono text-foreground">${r.spendUsd.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">Rate</span>
                      <span className="font-mono text-foreground">৳{r.billingRate}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">WAC</span>
                      <span className="font-mono text-foreground">৳{r.wac}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">Gap</span>
                      <span className={`font-mono ${r.gap >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                        ৳{r.gap}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Total Summary */}
          <Card className="dark:bg-card/80 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="h-4 w-4" /> Total Profit Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-4 px-4">
              <Table className="min-w-[500px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Platform</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Spend (USD)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Rate (BDT)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Gap (BDT)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Profit (BDT)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.platform}>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${PLATFORM_COLORS[r.platform] || ""}`}>
                          {PLATFORM_LABELS[r.platform] || r.platform}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">${r.spendUsd.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-xs">৳{r.billingRate}</TableCell>
                      <TableCell className="text-right font-mono text-xs">৳{r.gap}</TableCell>
                      <TableCell className="text-right font-mono text-xs">৳{r.profitBdt.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={r.marginPct >= 0 ? "default" : "destructive"} className="text-xs">
                          {r.marginPct >= 0 ? "+" : ""}{r.marginPct}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Total row */}
                  <TableRow className="font-semibold border-t-2">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right font-mono text-xs">${Math.round(totalSpend * 100 / 100).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
                    <TableCell className="text-right font-mono text-xs">৳{totalProfit.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={totalMargin >= 0 ? "default" : "destructive"} className="text-xs">
                        {totalMargin >= 0 ? "+" : ""}{Math.round(totalMargin * 10) / 10}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
