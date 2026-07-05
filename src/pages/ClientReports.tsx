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
          view_content: 0,
          add_to_cart: 0,
          initiate_checkout: 0,
          purchase: 0,
          messaging_conversations: 0,
          new_messaging_contacts: 0,
          create_order: 0,
          reach: 0,
          cpm: 0,
          cost_per_purchase: 0,
          cost_per_message: 0,
          conversations_tiktok_dm: 0,
          leads_tiktok_dm: 0,
          conversations_instant_msg: 0,
          frequency: 0,
          cost_per_result: 0,
          result_type: null,
          video_views: 0,
          all_conversions: 0,
          view_through_conversions: 0,
        };
      }
      map[key].impressions += Number(row.impressions);
      map[key].clicks += Number(row.clicks);
      map[key].spend += Number(row.spend);
      map[key].results += Number(row.results ?? 0);
      map[key].conversion_value += Number(row.conversion_value ?? 0);
      map[key].view_content = (map[key].view_content ?? 0) + Number(row.view_content ?? 0);
      map[key].add_to_cart = (map[key].add_to_cart ?? 0) + Number(row.add_to_cart ?? 0);
      map[key].initiate_checkout = (map[key].initiate_checkout ?? 0) + Number(row.initiate_checkout ?? 0);
      map[key].purchase = (map[key].purchase ?? 0) + Number(row.purchase ?? 0);
      map[key].messaging_conversations = (map[key].messaging_conversations ?? 0) + Number(row.messaging_conversations ?? 0);
      map[key].new_messaging_contacts = (map[key].new_messaging_contacts ?? 0) + Number(row.new_messaging_contacts ?? 0);
      map[key].create_order = (map[key].create_order ?? 0) + Number(row.create_order ?? 0);
      map[key].reach = (map[key].reach ?? 0) + Number(row.reach ?? 0);
      map[key].conversations_tiktok_dm = (map[key].conversations_tiktok_dm ?? 0) + Number(row.conversations_tiktok_dm ?? 0);
      map[key].leads_tiktok_dm = (map[key].leads_tiktok_dm ?? 0) + Number(row.leads_tiktok_dm ?? 0);
      map[key].conversations_instant_msg = (map[key].conversations_instant_msg ?? 0) + Number(row.conversations_instant_msg ?? 0);
      map[key].video_views = (map[key].video_views ?? 0) + Number(row.video_views ?? 0);
      map[key].all_conversions = (map[key].all_conversions ?? 0) + Number(row.all_conversions ?? 0);
      map[key].view_through_conversions = (map[key].view_through_conversions ?? 0) + Number(row.view_through_conversions ?? 0);
      // Latest row wins for result_type (should be stable per campaign); frequency
      // gets a weighted average by impressions later.
      if (row.result_type && !map[key].result_type) map[key].result_type = row.result_type;
      if (row.budget) map[key].budget = (map[key].budget ?? 0) + Number(row.budget);
    }
    // Recompute derived ratios from aggregated totals (mirrors agency view).
    for (const r of Object.values(map)) {
      if ((r.purchase ?? 0) > 0) r.cost_per_purchase = r.spend / r.purchase!;
      if ((r.messaging_conversations ?? 0) > 0) r.cost_per_message = r.spend / r.messaging_conversations!;
      if (r.impressions > 0) r.cpm = (r.spend / r.impressions) * 1000;
      if ((r.results ?? 0) > 0) r.cost_per_result = r.spend / r.results;
      if ((r.reach ?? 0) > 0) r.frequency = r.impressions / r.reach;
    }

    // Match agency view: only inject active campaigns with no metrics.
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

      <CampaignAnalyticsPanel campaignRows={campaignRows} onRefresh={fetchData} canPause={canPause} canResume={canResume} />
    </div>
  );
}
