import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientDateFilter, ClientDateRange, ClientDatePreset } from "@/components/ClientDateFilter";
import { DeepDiveTable, CampaignRow } from "@/components/client-analytics/DeepDiveTable";
import { SalesFunnel } from "@/components/client-analytics/SalesFunnel";
import { PlatformComparison } from "@/components/client-analytics/PlatformComparison";
import { BarChart3, DollarSign, TrendingUp, ShoppingCart, Target } from "lucide-react";
import { format } from "date-fns";

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const safeDivide = (a: number, b: number) => (b > 0 ? a / b : 0);

export default function ClientReports() {
  const { user } = useAuth();
  const { effectiveClientId } = useImpersonation();
  const [rawMetrics, setRawMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<ClientDateRange | null>(null);
  const [preset, setPreset] = useState<ClientDatePreset>("all_time");

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Get campaigns linked to client's ad accounts via ad_account_clients
    const { data: accClients } = await supabase
      .from("ad_account_clients")
      .select("ad_account_id")
      .eq("client_id", user.id);
    const accIds = accClients?.map((a) => a.ad_account_id) ?? [];

    if (accIds.length > 0) {
      // Query campaigns table for this client's ad accounts
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, name, platform, status, ad_account_id")
        .in("ad_account_id", accIds);

      if (campaigns && campaigns.length > 0) {
        const campaignIds = campaigns.map((c) => c.id);

        // Query daily_metrics with optional date filtering
        let metricsQuery = supabase
          .from("daily_metrics")
          .select("*")
          .in("campaign_id", campaignIds);

        if (dateRange) {
          metricsQuery = metricsQuery
            .gte("data_date", format(dateRange.from, "yyyy-MM-dd"))
            .lte("data_date", format(dateRange.to, "yyyy-MM-dd"));
        }

        const { data: metrics } = await metricsQuery;

        // Combine campaigns + metrics
        const enriched = (metrics ?? []).map((m: any) => {
          const campaign = campaigns.find((c) => c.id === m.campaign_id);
          return { ...m, campaign };
        });

        setRawMetrics(enriched);
      } else {
        setRawMetrics([]);
      }
    } else {
      setRawMetrics([]);
    }
    setLoading(false);
  }, [user, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRangeChange = (range: ClientDateRange | null, p: ClientDatePreset) => {
    setDateRange(range);
    setPreset(p);
  };

  // Aggregate by campaign_id for the table (one row per campaign)
  const campaignRows: CampaignRow[] = useMemo(() => {
    const map: Record<string, CampaignRow> = {};
    for (const row of rawMetrics) {
      const key = row.campaign_id;
      if (!map[key]) {
        map[key] = {
          campaign_name: row.campaign?.name || "Unknown",
          platform: row.campaign?.platform || "unknown",
          status: row.campaign?.status ?? "active",
          impressions: 0,
          clicks: 0,
          spend: 0,
          results: 0,
          conversion_value: 0,
        };
      }
      map[key].impressions += Number(row.impressions);
      map[key].clicks += Number(row.clicks);
      map[key].spend += Number(row.spend);
      map[key].results += Number(row.results ?? 0);
      map[key].conversion_value += Number(row.conversion_value ?? 0);
    }
    return Object.values(map);
  }, [rawMetrics]);

  // Totals
  const totals = useMemo(() => {
    const t = { spend: 0, impressions: 0, clicks: 0, results: 0, convValue: 0 };
    for (const r of campaignRows) {
      t.spend += r.spend;
      t.impressions += r.impressions;
      t.clicks += r.clicks;
      t.results += r.results;
      t.convValue += r.conversion_value;
    }
    return t;
  }, [campaignRows]);

  const avgRoas = safeDivide(totals.convValue, totals.spend);
  const avgCpo = safeDivide(totals.spend, totals.results);

  // Platform stats for comparison
  const platformStats = useMemo(() => {
    const map: Record<string, { platform: string; totalSpend: number; totalResults: number; totalConversionValue: number }> = {};
    for (const r of campaignRows) {
      if (!map[r.platform]) {
        map[r.platform] = { platform: r.platform, totalSpend: 0, totalResults: 0, totalConversionValue: 0 };
      }
      map[r.platform].totalSpend += r.spend;
      map[r.platform].totalResults += r.results;
      map[r.platform].totalConversionValue += r.conversion_value;
    }
    return Object.values(map);
  }, [campaignRows]);

  if (loading) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Performance Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Deep dive into your campaign performance across all platforms
        </p>
      </div>

      <ClientDateFilter onRangeChange={handleRangeChange} activePreset={preset} />

      {/* KPI Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{fmt(totals.spend)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
              <ShoppingCart className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Results</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{totals.results.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
              <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg ROAS</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{avgRoas.toFixed(2)}x</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
              <Target className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg CPO</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{fmt(avgCpo)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="deep-dive">Campaign Deep Dive</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            <SalesFunnel
              impressions={totals.impressions}
              clicks={totals.clicks}
              results={totals.results}
            />
            <PlatformComparison data={platformStats} />
          </div>
        </TabsContent>

        <TabsContent value="deep-dive">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Campaign Performance</span>
                <Badge variant="secondary" className="font-mono">
                  {campaignRows.length} campaigns
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DeepDiveTable data={campaignRows} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
