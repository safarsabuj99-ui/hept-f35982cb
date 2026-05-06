import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { isActiveStatus } from "@/lib/campaignStatus";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { debounce } from "@/lib/debounce";
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
  const initialLoadingRef = useRef(true);
  const [dateRange, setDateRange] = useState<ClientDateRange | null>(() => { const t = getLocalTodayClient(); return { from: t, to: t }; });
  const [preset, setPreset] = useState<ClientDatePreset>("today");
  const [canPause, setCanPause] = useState(false);
  const [canResume, setCanResume] = useState(false);

  const fetchData = useCallback(async () => {
    if (!effectiveClientId) return;
    if (initialLoadingRef.current) setLoading(true);

    // Fetch client permissions
    const { data: profileData } = await supabase
      .from("profiles")
      .select("client_permissions")
      .eq("user_id", effectiveClientId)
      .maybeSingle();
    const perms = (profileData as any)?.client_permissions || {};
    const legacy = perms.can_toggle_campaigns === true;
    setCanPause(perms.can_pause_campaigns === true || legacy);
    setCanResume(perms.can_resume_campaigns === true || legacy);

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
        .in("ad_account_id", accIds)
        .eq("client_id", effectiveClientId);

      setCampaigns(campaigns ?? []);

      if (campaigns && campaigns.length > 0) {
        const campaignIds = campaigns.map((c) => c.id);
        const fromDate = dateRange ? format(dateRange.from, "yyyy-MM-dd") : null;
        const toDate = dateRange ? format(dateRange.to, "yyyy-MM-dd") : null;

        // Chunk campaign IDs and paginate each chunk to bypass 1000-row cap.
        const CHUNK = 200;
        const chunks: string[][] = [];
        for (let i = 0; i < campaignIds.length; i += CHUNK) {
          chunks.push(campaignIds.slice(i, i + CHUNK));
        }

        const results = await Promise.all(
          chunks.map((ids) =>
            fetchAllRows<any>(() => {
              let q = supabase.from("daily_metrics").select("*").in("campaign_id", ids);
              if (fromDate && toDate) {
                q = q.gte("data_date", fromDate).lte("data_date", toDate);
              }
              return q;
            })
          )
        );
        const metrics = results.flat();

        // Combine campaigns + metrics
        const enriched = metrics.map((m: any) => {
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
    initialLoadingRef.current = false;
  }, [effectiveClientId, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription — heavily debounced and filtered to this client.
  // Sync workers can write hundreds of daily_metrics rows per second; without
  // debouncing this caused the page to refetch & flash skeletons every second.
  useEffect(() => {
    if (!effectiveClientId) return;
    const debounced = debounce(() => fetchData(), 2500);
    const channel = supabase
      .channel("client-reports-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns", filter: `client_id=eq.${effectiveClientId}` }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_metrics" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_performance" }, debounced)
      .subscribe();
    return () => { debounced.cancel(); supabase.removeChannel(channel); };
  }, [effectiveClientId, fetchData]);

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
      if (row.budget) map[key].budget = (map[key].budget ?? 0) + Number(row.budget);
      if (row.conversations_tiktok_dm) map[key].conversations_tiktok_dm = (map[key].conversations_tiktok_dm ?? 0) + Number(row.conversations_tiktok_dm);
      if (row.leads_tiktok_dm) map[key].leads_tiktok_dm = (map[key].leads_tiktok_dm ?? 0) + Number(row.leads_tiktok_dm);
      if (row.conversations_instant_msg) map[key].conversations_instant_msg = (map[key].conversations_instant_msg ?? 0) + Number(row.conversations_instant_msg);
    }
    // Inject active campaigns that have no metrics for the selected date range.
    // When the client has campaign on/off control, also inject paused campaigns
    // so they have rows to switch back ON from the client panel.
    for (const c of campaigns) {
      const isPaused = c.status?.toLowerCase() === "paused" || c.status?.toLowerCase() === "disable";
      const shouldInject = isActiveStatus(c.status) || (canResume && isPaused);
      if (shouldInject && !map[c.id]) {
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
    return Object.values(map).filter(r => {
      if (isActiveStatus(r.status)) return true;
      if (r.spend > 0 || r.impressions > 0 || r.clicks > 0 || r.results > 0) return true;
      // Keep paused rows visible when client can resume them
      if (canResume) {
        const s = r.status.toLowerCase();
        if (s === "paused" || s === "disable") return true;
      }
      return false;
    });
  }, [rawMetrics, adAccountMap, campaigns, canResume]);


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

      <CampaignAnalyticsPanel campaignRows={campaignRows} onRefresh={fetchData} canPause={canPause} canResume={canResume} />
    </div>
  );
}
