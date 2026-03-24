import { useEffect, useState, useMemo, useCallback } from "react";
import { isActiveStatus } from "@/lib/campaignStatus";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangeFilter, DateRange, getLocalToday } from "@/components/DateRangeFilter";
import { CampaignRow } from "@/components/client-analytics/DeepDiveTable";
import { CampaignAnalyticsPanel } from "@/components/client-analytics/CampaignAnalyticsPanel";
import { BarChart3, Loader2 } from "lucide-react";

export default function CampaignMapping() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clientFilter, setClientFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | null>(() => { const t = getLocalToday(); return { from: t, to: t }; });

  const fetchData = useCallback(async () => {
    if (!initialLoading) setRefreshing(true);

    const { data: mappedAssignments } = await supabase
      .from("ad_account_clients")
      .select("ad_account_id, client_id, mapping_keyword")
      .neq("mapping_keyword", "");

    const mappedAccountIds = [...new Set(mappedAssignments?.map((r: any) => r.ad_account_id) || [])];

    if (mappedAccountIds.length === 0) {
      setCampaigns([]);
      setMetrics([]);
      setInitialLoading(false);
      setRefreshing(false);
      return;
    }

    let campaignsQuery = supabase.from("campaigns").select("*, objective").order("created_at", { ascending: false });
    campaignsQuery = campaignsQuery.in("ad_account_id", mappedAccountIds);

    const [{ data: camps }, { data: roles }, { data: profiles }, { data: accounts }] = await Promise.all([
      campaignsQuery,
      supabase.from("user_roles").select("user_id").eq("role", "client"),
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("ad_accounts").select("id, account_name, ad_account_id"),
    ]);

    const campaignIds = camps?.map((c: any) => c.id) ?? [];
    let metricData: any[] = [];
    if (campaignIds.length > 0) {
      let metricsQuery = supabase
        .from("daily_metrics")
        .select("*")
        .in("campaign_id", campaignIds)
        .order("data_date", { ascending: false });

      if (dateRange) {
        const { format } = await import("date-fns");
        metricsQuery = metricsQuery
          .gte("data_date", format(dateRange.from, "yyyy-MM-dd"))
          .lte("data_date", format(dateRange.to, "yyyy-MM-dd"));
      }

      const { data: mets } = await metricsQuery;
      metricData = mets ?? [];
    }

    setCampaigns(camps ?? []);
    setMetrics(metricData);
    setAdAccounts(accounts ?? []);
    const clientIds = new Set(roles?.map((r: any) => r.user_id) ?? []);
    setClients((profiles ?? []).filter((p: any) => clientIds.has(p.user_id)));
    setInitialLoading(false);
    setRefreshing(false);
  }, [dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("campaign-mapping-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_metrics" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_performance" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const adAccountNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of adAccounts) {
      map[a.id] = a.account_name || a.ad_account_id || "";
    }
    return map;
  }, [adAccounts]);

  // Aggregate metrics by campaign_id into CampaignRow[]
  const campaignRows: CampaignRow[] = useMemo(() => {
    const map: Record<string, CampaignRow> = {};

    for (const m of metrics) {
      const key = m.campaign_id;
      if (!map[key]) {
        const campaign = campaigns.find((c: any) => c.id === key);
        if (!campaign) continue;
        map[key] = {
          campaign_name: campaign.name || "Unknown",
          platform: campaign.platform || "unknown",
          status: campaign.status ?? "active",
          ad_account_name: adAccountNameMap[campaign.ad_account_id] || "",
          campaign_id: campaign.id,
          objective: campaign.objective || "",
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
          cost_per_purchase: 0,
          cost_per_message: 0,
          cpm: 0,
          reach: 0,
          new_messaging_contacts: 0,
          create_order: 0,
        };
      }
      map[key].impressions += Number(m.impressions);
      map[key].clicks += Number(m.clicks);
      map[key].spend += Number(m.spend);
      map[key].results += Number(m.results ?? 0);
      map[key].conversion_value += Number(m.conversion_value ?? 0);
      map[key].view_content = (map[key].view_content ?? 0) + Number(m.view_content ?? 0);
      map[key].add_to_cart = (map[key].add_to_cart ?? 0) + Number(m.add_to_cart ?? 0);
      map[key].initiate_checkout = (map[key].initiate_checkout ?? 0) + Number(m.initiate_checkout ?? 0);
      map[key].purchase = (map[key].purchase ?? 0) + Number(m.purchase ?? 0);
      map[key].messaging_conversations = (map[key].messaging_conversations ?? 0) + Number(m.messaging_conversations ?? 0);
      map[key].reach = (map[key].reach ?? 0) + Number(m.reach ?? 0);
      map[key].new_messaging_contacts = (map[key].new_messaging_contacts ?? 0) + Number(m.new_messaging_contacts ?? 0);
      map[key].create_order = (map[key].create_order ?? 0) + Number(m.create_order ?? 0);
      map[key].budget = (map[key].budget ?? 0) + Number(m.budget ?? 0);
      map[key].conversations_tiktok_dm = (map[key].conversations_tiktok_dm ?? 0) + Number(m.conversations_tiktok_dm ?? 0);
      map[key].leads_tiktok_dm = (map[key].leads_tiktok_dm ?? 0) + Number(m.leads_tiktok_dm ?? 0);
      map[key].conversations_instant_msg = (map[key].conversations_instant_msg ?? 0) + Number(m.conversations_instant_msg ?? 0);
    }

    // Recalculate cost_per_purchase and cost_per_message from aggregated totals
    for (const row of Object.values(map)) {
      if ((row.purchase ?? 0) > 0) row.cost_per_purchase = row.spend / row.purchase!;
      if ((row.messaging_conversations ?? 0) > 0) row.cost_per_message = row.spend / row.messaging_conversations!;
      if (row.impressions > 0) row.cpm = (row.spend / row.impressions) * 1000;
    }

    // Inject active campaigns with no metrics
    for (const c of campaigns) {
      if (isActiveStatus(c.status) && !map[c.id]) {
        map[c.id] = {
          campaign_name: c.name || "Unknown",
          platform: c.platform || "unknown",
          status: c.status,
          ad_account_name: adAccountNameMap[c.ad_account_id] || "",
          campaign_id: c.id,
          objective: c.objective || "",
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
  }, [metrics, campaigns, adAccountNameMap]);

  // Apply client filter
  const filteredRows = useMemo(() => {
    if (clientFilter === "all") return campaignRows;
    return campaignRows.filter((r) => {
      const campaign = campaigns.find((c: any) => c.id === r.campaign_id);
      return campaign && campaign.client_id === clientFilter;
    });
  }, [campaignRows, clientFilter, campaigns]);

  if (initialLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Campaigns
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Unified spend analytics & campaign management
        </p>
      </div>

      {/* Admin Controls Bar */}
      <div className="flex flex-wrap items-end gap-4">
        {isAdmin && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Client</Label>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="w-44 h-9 text-sm">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map((c: any) => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1 flex-1 min-w-0">
          <Label className="text-xs text-muted-foreground">Date Range</Label>
          <div className="flex items-center gap-2">
            <DateRangeFilter onRangeChange={(range) => setDateRange(range)} />
            {refreshing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
          </div>
        </div>
      </div>

      {/* Analytics Panel with subtle opacity during refresh */}
      <div className={refreshing ? "opacity-60 pointer-events-none transition-opacity duration-200" : "transition-opacity duration-200"}>
        <CampaignAnalyticsPanel campaignRows={filteredRows} onRefresh={fetchData} />
      </div>
    </div>
  );
}