import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangeFilter, DateRange, getLocalToday } from "@/components/DateRangeFilter";
import { DeepDiveTable, CampaignRow } from "@/components/client-analytics/DeepDiveTable";
import { DollarSign, ShoppingCart, TrendingUp, Target, BarChart3 } from "lucide-react";

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const safeDivide = (a: number, b: number) => (b > 0 ? a / b : 0);

export default function CampaignMapping() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | null>(() => { const t = getLocalToday(); return { from: t, to: t }; });

  const fetchData = useCallback(async () => {
    setLoading(true);

    const { data: mappedAssignments } = await supabase
      .from("ad_account_clients")
      .select("ad_account_id, client_id, mapping_keyword")
      .neq("mapping_keyword", "");

    const mappedAccountIds = [...new Set(mappedAssignments?.map((r: any) => r.ad_account_id) || [])];

    if (mappedAccountIds.length === 0) {
      setCampaigns([]);
      setMetrics([]);
      setLoading(false);
      return;
    }

    let campaignsQuery = supabase.from("campaigns").select("*").order("created_at", { ascending: false });
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
    setLoading(false);
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
          impressions: 0,
          clicks: 0,
          spend: 0,
          results: 0,
          conversion_value: 0,
        };
      }
      map[key].impressions += Number(m.impressions);
      map[key].clicks += Number(m.clicks);
      map[key].spend += Number(m.spend);
      map[key].results += Number(m.results ?? 0);
      map[key].conversion_value += Number(m.conversion_value ?? 0);
    }

    // Inject active campaigns with no metrics
    for (const c of campaigns) {
      if (c.status === "active" && !map[c.id]) {
        map[c.id] = {
          campaign_name: c.name || "Unknown",
          platform: c.platform || "unknown",
          status: "active",
          ad_account_name: adAccountNameMap[c.ad_account_id] || "",
          campaign_id: c.id,
          impressions: 0,
          clicks: 0,
          spend: 0,
          results: 0,
          conversion_value: 0,
        };
      }
    }

    return Object.values(map);
  }, [metrics, campaigns, adAccountNameMap]);

  // Apply client filter
  const filteredRows = useMemo(() => {
    if (clientFilter === "all") return campaignRows;
    // Find ad_account_ids assigned to this client
    const clientAccIds = new Set(
      (campaigns ?? [])
        .filter((c: any) => c.client_id === clientFilter)
        .map((c: any) => c.ad_account_id)
    );
    return campaignRows.filter((r) => {
      const campaign = campaigns.find((c: any) => c.id === r.campaign_id);
      return campaign && campaign.client_id === clientFilter;
    });
  }, [campaignRows, clientFilter, campaigns]);

  // Totals
  const totals = useMemo(() => {
    const t = { spend: 0, impressions: 0, clicks: 0, results: 0, convValue: 0 };
    for (const r of filteredRows) {
      t.spend += r.spend;
      t.impressions += r.impressions;
      t.clicks += r.clicks;
      t.results += r.results;
      t.convValue += r.conversion_value;
    }
    return t;
  }, [filteredRows]);

  const avgRoas = safeDivide(totals.convValue, totals.spend);
  const avgCpo = safeDivide(totals.spend, totals.results);

  // Platform-filtered rows
  const metaRows = useMemo(() => filteredRows.filter(r => r.platform === "meta"), [filteredRows]);
  const tiktokRows = useMemo(() => filteredRows.filter(r => r.platform === "tiktok"), [filteredRows]);
  const googleRows = useMemo(() => filteredRows.filter(r => r.platform === "google"), [filteredRows]);

  if (loading) {
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
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Date Range</Label>
          <DateRangeFilter onRangeChange={(range) => setDateRange(range)} />
        </div>
      </div>

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

      {/* Platform Tabs with DeepDiveTable */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">
            All
            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{filteredRows.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="meta">
            Meta
            {metaRows.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{metaRows.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="tiktok">
            TikTok
            {tiktokRows.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{tiktokRows.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="google">
            Google
            {googleRows.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{googleRows.length}</Badge>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <DeepDiveTable data={filteredRows} onCampaignPaused={fetchData} />
        </TabsContent>
        <TabsContent value="meta">
          <DeepDiveTable data={metaRows} onCampaignPaused={fetchData} />
        </TabsContent>
        <TabsContent value="tiktok">
          <DeepDiveTable data={tiktokRows} onCampaignPaused={fetchData} />
        </TabsContent>
        <TabsContent value="google">
          <DeepDiveTable data={googleRows} onCampaignPaused={fetchData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}