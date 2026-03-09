import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";

interface ProfitData {
  totalRevenueBdt: number;
  totalCogsBdt: number;
  totalProfitBdt: number;
  wac: number;
}

interface ProfitLossWidgetProps {
  dateRange?: { from: Date; to: Date } | null;
}

export function ProfitLossWidget({ dateRange }: ProfitLossWidgetProps) {
  const [data, setData] = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Step 1: Get mapped accounts WITH keywords
      const { data: mappedAssignments } = await supabase
        .from("ad_account_clients")
        .select("ad_account_id, client_id, mapping_keyword")
        .neq("mapping_keyword", "");

      const mappedAccountIds = [...new Set(mappedAssignments?.map((r: any) => r.ad_account_id) || [])];

      if (mappedAccountIds.length === 0) {
        setData({ totalRevenueBdt: 0, totalCogsBdt: 0, totalProfitBdt: 0, wac: 128 });
        setLoading(false);
        return;
      }

      // Get campaigns from mapped accounts only
      const { data: mappedCampaigns } = await supabase
        .from("campaigns")
        .select("id, ad_account_id, platform")
        .in("ad_account_id", mappedAccountIds);

      const campaignIds = mappedCampaigns?.map((c: any) => c.id) ?? [];

      let metricsQuery = supabase.from("daily_metrics").select("campaign_id, spend");
      if (campaignIds.length > 0) {
        metricsQuery = metricsQuery.in("campaign_id", campaignIds);
      }
      if (dateRange) {
        metricsQuery = metricsQuery
          .gte("data_date", format(dateRange.from, "yyyy-MM-dd"))
          .lte("data_date", format(dateRange.to, "yyyy-MM-dd"));
      }

      const [purchasesRes, metricsRes, profilesRes, rolesRes] = await Promise.all([
        supabase.from("usd_purchases").select("bdt_amount_paid, usd_received"),
        metricsQuery,
        supabase.from("profiles").select("user_id, pricing_config"),
        supabase.from("user_roles").select("user_id").eq("role", "client"),
      ]);

      // 1. Calculate WAC
      let totalBdt = 0, totalUsd = 0;
      for (const p of (purchasesRes.data ?? []) as any[]) {
        totalBdt += Number(p.bdt_amount_paid);
        totalUsd += Number(p.usd_received);
      }
      const wac = totalUsd > 0 ? totalBdt / totalUsd : 128;

      // 2. Build mappings
      const campaignMap: Record<string, { ad_account_id: string; platform: string }> = {};
      for (const c of (campaignsRes.data ?? []) as any[]) {
        campaignMap[c.id] = { ad_account_id: c.ad_account_id, platform: c.platform };
      }

      const accToClients: Record<string, string[]> = {};
      for (const ac of (accClientsRes.data ?? []) as any[]) {
        if (!accToClients[ac.ad_account_id]) accToClients[ac.ad_account_id] = [];
        accToClients[ac.ad_account_id].push(ac.client_id);
      }

      const clientIds = new Set((rolesRes.data ?? []).map((r) => r.user_id));
      const profileMap: Record<string, any> = {};
      for (const p of (profilesRes.data ?? []) as any[]) {
        if (clientIds.has(p.user_id)) profileMap[p.user_id] = p;
      }

      // 3. Aggregate spend per client per platform
      const clientPlatformSpend: Record<string, Record<string, number>> = {};
      for (const m of (metricsRes.data ?? []) as any[]) {
        const camp = campaignMap[m.campaign_id];
        if (!camp) continue;
        const clients = accToClients[camp.ad_account_id] || [];
        for (const cid of clients) {
          if (!clientIds.has(cid)) continue;
          if (!clientPlatformSpend[cid]) clientPlatformSpend[cid] = {};
          clientPlatformSpend[cid][camp.platform] = (clientPlatformSpend[cid][camp.platform] || 0) + Number(m.spend);
        }
      }

      // 4. Calculate revenue & COGS
      let totalRevenueBdt = 0;
      let totalCogsBdt = 0;
      for (const [cid, platformSpends] of Object.entries(clientPlatformSpend)) {
        const profile = profileMap[cid];
        if (!profile) continue;
        const pricingConfig = profile.pricing_config as any;
        const rates = pricingConfig?.flat_rates || pricingConfig?.platform_rates || { meta: 120, tiktok: 120, google: 120 };

        for (const [platform, spendUsd] of Object.entries(platformSpends)) {
          const rate = Number(rates[platform] || 120);
          totalRevenueBdt += (spendUsd as number) * rate;
          totalCogsBdt += (spendUsd as number) * wac;
        }
      }

      const totalProfitBdt = totalRevenueBdt - totalCogsBdt;

      setData({ totalRevenueBdt: Math.round(totalRevenueBdt), totalCogsBdt: Math.round(totalCogsBdt), totalProfitBdt: Math.round(totalProfitBdt), wac: Math.round(wac * 100) / 100 });
      setLoading(false);
    };
    fetchData();
  }, [dateRange]);

  const fmt = (n: number) => `৳${n.toLocaleString("en-US")}`;
  const marginPct = data && data.totalRevenueBdt > 0 ? ((data.totalProfitBdt / data.totalRevenueBdt) * 100).toFixed(1) : "0";
  const isProfit = data ? data.totalProfitBdt >= 0 : true;

  if (loading) return <Skeleton className="h-[200px]" />;

  return (
    <Card className="dark:bg-card/80 dark:backdrop-blur-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">Profit / Loss (BDT)</CardTitle>
        <Badge variant={isProfit ? "default" : "destructive"} className="text-xs font-mono">
          {isProfit ? "+" : ""}{marginPct}%
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Revenue</span>
          <span className="font-mono">{fmt(data?.totalRevenueBdt ?? 0)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Cost (WAC: {data?.wac})</span>
          <span className="font-mono">{fmt(data?.totalCogsBdt ?? 0)}</span>
        </div>
        <div className="flex justify-between border-t pt-3">
          <span className="font-medium text-sm">Margin</span>
          <span className={`flex items-center gap-1 font-mono font-bold ${isProfit ? "text-success" : "text-destructive"}`}>
            {isProfit ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {fmt(Math.abs(data?.totalProfitBdt ?? 0))}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
