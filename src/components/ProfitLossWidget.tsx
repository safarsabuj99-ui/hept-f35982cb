import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getPlatformRates } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/hooks/usePermissions";
import { toISODate, getLocalToday } from "@/components/DateRangeFilter";

interface ProfitData {
  totalRevenueBdt: number;
  totalCogsBdt: number;
  grossProfitBdt: number;
  totalOpexBdt: number;
  netProfitBdt: number;
  wac: number;
}

interface ProfitLossWidgetProps {
  dateRange?: { from: Date; to: Date } | null;
}

export function ProfitLossWidget({ dateRange }: ProfitLossWidgetProps) {
  const { hasPermission } = usePermissions();
  const { authReady } = useAuth();
  const [data, setData] = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authReady) return;
    const fetchData = async () => {
      setLoading(true);

      // Step 1: Fetch purchases (date-filtered if range provided)
      let purchasesQuery = supabase.from("usd_purchases").select("bdt_amount_paid, usd_received, date");
      if (dateRange) {
        purchasesQuery = purchasesQuery
          .gte("date", toISODate(dateRange.from))
          .lte("date", toISODate(dateRange.to));
      }

      // Fetch expenses (excluding Owner_Draw, date-filtered)
      let expensesQuery = supabase.from("agency_expenses").select("amount_bdt, category, date").neq("category", "Owner_Draw");
      if (dateRange) {
        expensesQuery = expensesQuery
          .gte("date", toISODate(dateRange.from))
          .lte("date", toISODate(dateRange.to));
      }

      const [purchasesRes, profilesRes, rolesRes, expensesRes] = await Promise.all([
        purchasesQuery,
        supabase.from("profiles").select("user_id, pricing_config"),
        supabase.from("user_roles").select("user_id").eq("role", "client"),
        expensesQuery,
      ]);

      // Calculate OpEx
      let totalOpexBdt = 0;
      for (const e of (expensesRes.data ?? []) as any[]) {
        totalOpexBdt += Number(e.amount_bdt);
      }

      // Step 2: Calculate WAC with cascading fallback
      const calcWac = (data: any[] | null) => {
        let bdt = 0, usd = 0;
        for (const p of (data ?? [])) { bdt += Number(p.bdt_amount_paid); usd += Number(p.usd_received); }
        return usd > 0 ? Math.round((bdt / usd) * 100) / 100 : 0;
      };

      let wac = calcWac(purchasesRes.data);

      if (wac === 0) {
        const today = getLocalToday();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const { data: monthPurchases } = await supabase.from("usd_purchases")
          .select("bdt_amount_paid, usd_received")
          .gte("date", toISODate(firstOfMonth))
          .lte("date", toISODate(today));
        wac = calcWac(monthPurchases);
      }

      if (wac === 0) {
        const { data: allPurchases } = await supabase.from("usd_purchases")
          .select("bdt_amount_paid, usd_received");
        wac = calcWac(allPurchases);
      }

      // Step 3: Build client profile map
      const clientIds = new Set((rolesRes.data ?? []).map((r: any) => r.user_id));
      const profileMap: Record<string, any> = {};
      for (const p of (profilesRes.data ?? []) as any[]) {
        if (clientIds.has(p.user_id)) profileMap[p.user_id] = p;
      }

      // Step 4: Get campaigns with client_id
      const { data: allCampaigns } = await supabase.from("campaigns").select("id, platform, client_id");

      if (!allCampaigns?.length) {
        setData({ totalRevenueBdt: 0, totalCogsBdt: 0, grossProfitBdt: 0, totalOpexBdt: Math.round(totalOpexBdt), netProfitBdt: -Math.round(totalOpexBdt), wac });
        setLoading(false);
        return;
      }

      const campaignToPlatform: Record<string, string> = {};
      const campaignToClient: Record<string, string> = {};
      for (const c of allCampaigns) {
        campaignToPlatform[c.id] = c.platform;
        if (c.client_id) campaignToClient[c.id] = c.client_id;
      }

      // Step 5: Fetch daily_metrics with date range filter
      let metricsQuery = supabase.from("daily_metrics").select("campaign_id, spend");
      if (dateRange) {
        metricsQuery = metricsQuery
          .gte("data_date", toISODate(dateRange.from))
          .lte("data_date", toISODate(dateRange.to));
      }
      const { data: metricsData } = await metricsQuery;

      // Step 6: Aggregate spend per client per platform
      const clientPlatformSpend: Record<string, Record<string, number>> = {};
      for (const m of (metricsData ?? []) as any[]) {
        const clientId = campaignToClient[m.campaign_id];
        if (!clientId) continue;
        const platform = campaignToPlatform[m.campaign_id] || "meta";
        if (!clientPlatformSpend[clientId]) clientPlatformSpend[clientId] = {};
        clientPlatformSpend[clientId][platform] = (clientPlatformSpend[clientId][platform] || 0) + Number(m.spend);
      }

      // Step 7: Calculate revenue & COGS
      let totalRevenueBdt = 0;
      let totalCogsBdt = 0;

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

        const cogsBdt = totalSpendUsd * wac;
        totalRevenueBdt += revenueBdt;
        totalCogsBdt += cogsBdt;
      }

      const grossProfitBdt = totalRevenueBdt - totalCogsBdt;
      const netProfitBdt = grossProfitBdt - totalOpexBdt;

      setData({
        totalRevenueBdt: Math.round(totalRevenueBdt),
        totalCogsBdt: Math.round(totalCogsBdt),
        grossProfitBdt: Math.round(grossProfitBdt),
        totalOpexBdt: Math.round(totalOpexBdt),
        netProfitBdt: Math.round(netProfitBdt),
        wac,
      });
      setLoading(false);
    };
    fetchData();
  }, [dateRange, authReady]);

  const fmt = (n: number) => `৳${n.toLocaleString("en-US")}`;
  const netMarginPct = data && data.totalRevenueBdt > 0 ? ((data.netProfitBdt / data.totalRevenueBdt) * 100).toFixed(1) : "0";
  const grossMarginPct = data && data.totalRevenueBdt > 0 ? ((data.grossProfitBdt / data.totalRevenueBdt) * 100).toFixed(1) : "0";
  const isNetProfit = data ? data.netProfitBdt >= 0 : true;
  const isGrossProfit = data ? data.grossProfitBdt >= 0 : true;

  if (!hasPermission("can_view_profit")) return null;
  if (loading) return <Skeleton className="h-[280px]" />;

  return (
    <Card className="dark:bg-card/80 dark:backdrop-blur-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">Profit / Loss (BDT)</CardTitle>
        <Badge variant={isNetProfit ? "default" : "destructive"} className="text-xs font-mono">
          {isNetProfit ? "+" : ""}{netMarginPct}%
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Revenue</span>
          <span className="font-mono">{fmt(data?.totalRevenueBdt ?? 0)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Cost (WAC: {data?.wac})</span>
          <span className="font-mono">{fmt(data?.totalCogsBdt ?? 0)}</span>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="border-t pt-2 flex justify-between text-sm cursor-help">
                <span className="font-medium">Gross Profit</span>
                <span className={`font-mono font-semibold ${isGrossProfit ? "text-success" : "text-destructive"}`}>
                  {fmt(Math.abs(data?.grossProfitBdt ?? 0))}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Gross Margin: {isGrossProfit ? "+" : "-"}{grossMarginPct}%</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">OpEx</span>
          <span className="font-mono">{fmt(data?.totalOpexBdt ?? 0)}</span>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="border-t pt-2 flex justify-between cursor-help">
                <span className="font-medium text-sm">Net Profit</span>
                <span className={`flex items-center gap-1 font-mono font-bold ${isNetProfit ? "text-success" : "text-destructive"}`}>
                  {isNetProfit ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {fmt(Math.abs(data?.netProfitBdt ?? 0))}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Net Margin: {isNetProfit ? "+" : "-"}{netMarginPct}%</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
