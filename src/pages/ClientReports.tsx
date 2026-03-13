import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientDateFilter, ClientDateRange, ClientDatePreset, getLocalTodayClient } from "@/components/ClientDateFilter";
import { CampaignRow } from "@/components/client-analytics/DeepDiveTable";
import { CampaignAnalyticsPanel } from "@/components/client-analytics/CampaignAnalyticsPanel";
import { BarChart3 } from "lucide-react";
import { format } from "date-fns";

export default function ClientReports() {
  const { user } = useAuth();
  const { effectiveClientId } = useImpersonation();
  const [rawMetrics, setRawMetrics] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [adAccountMap, setAdAccountMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<ClientDateRange | null>(() => { const t = getLocalTodayClient(); return { from: t, to: t }; });
  const [preset, setPreset] = useState<ClientDatePreset>("today");
  const [canToggleCampaigns, setCanToggleCampaigns] = useState(false);

  const fetchData = useCallback(async () => {
    if (!effectiveClientId) return;
    setLoading(true);

    // Fetch client permissions
    const { data: profileData } = await supabase
      .from("profiles")
      .select("client_permissions")
      .eq("user_id", effectiveClientId)
      .maybeSingle();
    const perms = (profileData as any)?.client_permissions || {};
    setCanToggleCampaigns(perms.can_toggle_campaigns === true);

    const { data: accClients } = await supabase
      .from("ad_account_clients")
      .select("ad_account_id")
      .eq("client_id", effectiveClientId);
    const accIds = accClients?.map((a) => a.ad_account_id) ?? [];

    if (accIds.length > 0) {
      // Fetch ad account names
      const { data: adAccounts } = await supabase
        .from("ad_accounts")
        .select("id, account_name")
        .in("id", accIds);
      
      const nameMap: Record<string, string> = {};
      for (const acc of adAccounts ?? []) {
        nameMap[acc.id] = acc.account_name;
      }
      setAdAccountMap(nameMap);

      // Query campaigns table for this client's ad accounts
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, name, platform, status, ad_account_id")
        .in("ad_account_id", accIds);

      setCampaigns(campaigns ?? []);

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
      setCampaigns([]);
      setRawMetrics([]);
    }
    setLoading(false);
  }, [effectiveClientId, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("client-reports-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_metrics" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_performance" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
        const adAccountId = row.campaign?.ad_account_id;
        map[key] = {
          campaign_name: row.campaign?.name || "Unknown",
          platform: row.campaign?.platform || "unknown",
          status: row.campaign?.status ?? "active",
          ad_account_name: adAccountId ? adAccountMap[adAccountId] || "" : "",
          campaign_id: row.campaign?.id, // DB UUID for pause action
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
    // Inject active campaigns that have no metrics for the selected date range
    for (const c of campaigns) {
      if (isActiveStatus(c.status) && !map[c.id]) {
        map[c.id] = {
          campaign_name: c.name || "Unknown",
          platform: c.platform || "unknown",
          status: c.status,
          ad_account_name: c.ad_account_id ? adAccountMap[c.ad_account_id] || "" : "",
          campaign_id: c.id,
          impressions: 0,
          clicks: 0,
          spend: 0,
          results: 0,
          conversion_value: 0,
        };
      }
    }
    return Object.values(map).filter(r =>
      isActiveStatus(r.status) || r.spend > 0 || r.impressions > 0 || r.clicks > 0 || r.results > 0
    );
  }, [rawMetrics, adAccountMap, campaigns]);


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

      <CampaignAnalyticsPanel campaignRows={campaignRows} onRefresh={fetchData} canToggleCampaigns={canToggleCampaigns} />
    </div>
  );
}
