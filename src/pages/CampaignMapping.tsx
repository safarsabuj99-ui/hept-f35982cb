import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MapPin, Filter, FileText, BarChart3 } from "lucide-react";
import { TablePagination } from "@/components/TablePagination";
import { DateRangeFilter, DateRange } from "@/components/DateRangeFilter";
import { TableSkeleton } from "@/components/ui/premium-skeletons";

export default function CampaignMapping() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [overviewPage, setOverviewPage] = useState(1);
  const [overviewSize, setOverviewSize] = useState(20);
  const [spendPage, setSpendPage] = useState(1);
  const [spendSize, setSpendSize] = useState(20);
  const { toast } = useToast();

  const fetchData = async () => {
    const [{ data: camps }, { data: metricData }, { data: roles }, { data: profiles }] = await Promise.all([
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("daily_metrics").select("*").order("data_date", { ascending: false }),
      supabase.from("user_roles").select("user_id").eq("role", "client"),
      supabase.from("profiles").select("user_id, full_name"),
    ]);
    setCampaigns(camps ?? []);
    setMetrics(metricData ?? []);
    const clientIds = new Set(roles?.map((r: any) => r.user_id) ?? []);
    setClients((profiles ?? []).filter((p: any) => clientIds.has(p.user_id)));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const assignClient = async (campaignId: string, clientId: string) => {
    setSaving(campaignId);
    const { error } = await supabase
      .from("campaigns")
      .update({ client_id: clientId === "unassigned" ? null : clientId } as any)
      .eq("id", campaignId);
    setSaving(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Updated", description: "Campaign assignment saved" });
      fetchData();
    }
  };

  // Shared filtering for overview tab
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c: any) => {
      if (platformFilter !== "all" && c.platform !== platformFilter) return false;
      if (clientFilter !== "all" && c.client_id !== clientFilter) return false;
      return true;
    });
  }, [campaigns, platformFilter, clientFilter]);

  // Spend analytics aggregation
  const aggregatedRows = useMemo(() => {
    const filteredMetrics = dateRange
      ? metrics.filter((m: any) => {
          const d = new Date(m.data_date);
          return d >= dateRange.from && d <= dateRange.to;
        })
      : metrics;

    const map: Record<string, {
      campaign: any;
      totalSpend: number;
      totalImpressions: number;
      totalClicks: number;
      totalResults: number;
      totalConversionValue: number;
      days: number;
    }> = {};

    for (const m of filteredMetrics) {
      const key = m.campaign_id;
      if (!map[key]) {
        const campaign = campaigns.find((c: any) => c.id === key);
        if (!campaign) continue;
        map[key] = { campaign, totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalResults: 0, totalConversionValue: 0, days: 0 };
      }
      map[key].totalSpend += Number(m.spend);
      map[key].totalImpressions += Number(m.impressions);
      map[key].totalClicks += Number(m.clicks);
      map[key].totalResults += Number(m.results);
      map[key].totalConversionValue += Number(m.conversion_value);
      map[key].days += 1;
    }
    return Object.values(map);
  }, [metrics, campaigns, dateRange]);

  const filteredSpend = useMemo(() => {
    return aggregatedRows.filter((row) => {
      if (platformFilter !== "all" && row.campaign.platform !== platformFilter) return false;
      if (clientFilter !== "all" && row.campaign.client_id !== clientFilter) return false;
      return true;
    });
  }, [aggregatedRows, platformFilter, clientFilter]);

  const fmt = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const totalSpend = filteredSpend.reduce((s, r) => s + r.totalSpend, 0);
  const getClientName = (clientId: string | null) =>
    clients.find((c: any) => c.user_id === clientId)?.full_name ?? "—";

  useEffect(() => { setOverviewPage(1); setSpendPage(1); }, [platformFilter, clientFilter, dateRange]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
        <p className="text-muted-foreground">Manage campaign assignments and analyze spend</p>
      </div>

      {/* Shared Filters */}
      <Card>
        <CardContent className="flex flex-wrap gap-4 pt-6">
          <div className="space-y-1">
            <Label className="text-xs">Platform</Label>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="meta">Meta</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="google">Google</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <div className="space-y-1">
              <Label className="text-xs">Client</Label>
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map((c: any) => <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Date Range</Label>
            <DateRangeFilter onRangeChange={(range) => setDateRange(range)} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2"><MapPin className="h-4 w-4" />Overview</TabsTrigger>
          <TabsTrigger value="spend" className="gap-2"><BarChart3 className="h-4 w-4" />Spend Analytics</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : filteredCampaigns.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                  <MapPin className="h-10 w-10" />
                  <p>No campaigns found. Run a sync to discover campaigns.</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Platform</TableHead>
                        <TableHead>Platform ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Assigned Client</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCampaigns.slice((overviewPage - 1) * overviewSize, overviewPage * overviewSize).map((m: any) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{m.name || m.original_name_tag}</TableCell>
                          <TableCell><Badge variant="secondary" className="capitalize">{m.platform}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{m.platform_id}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs capitalize">{m.status}</Badge></TableCell>
                          <TableCell>
                            <Select value={m.client_id || "unassigned"} onValueChange={(v) => assignClient(m.id, v)}>
                              <SelectTrigger className="w-44">
                                <SelectValue placeholder="Assign..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {clients.map((c: any) => (
                                  <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination totalItems={filteredCampaigns.length} pageSize={overviewSize} currentPage={overviewPage} onPageChange={setOverviewPage} onPageSizeChange={(s) => { setOverviewSize(s); setOverviewPage(1); }} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Spend Analytics Tab */}
        <TabsContent value="spend" className="space-y-4">
          {/* KPI Summary */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Spend (USD)</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold">{fmt(totalSpend)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Campaigns</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold">{filteredSpend.length}</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : filteredSpend.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                  <FileText className="h-10 w-10" />
                  <p>No spend data. Run a sync from Integrations.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Campaign</TableHead>
                          {isAdmin && <TableHead>Client</TableHead>}
                          <TableHead>Platform</TableHead>
                          <TableHead className="text-right">Impressions</TableHead>
                          <TableHead className="text-right">Clicks</TableHead>
                          <TableHead className="text-right">Results</TableHead>
                          <TableHead className="text-right">Spend (USD)</TableHead>
                          <TableHead className="text-right">Days</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSpend.slice((spendPage - 1) * spendSize, spendPage * spendSize).map((row, idx) => (
                          <TableRow key={row.campaign.id || idx}>
                            <TableCell className="max-w-[200px] truncate">{row.campaign.name}</TableCell>
                            {isAdmin && <TableCell>{getClientName(row.campaign.client_id)}</TableCell>}
                            <TableCell><Badge variant="secondary" className="capitalize">{row.campaign.platform}</Badge></TableCell>
                            <TableCell className="text-right font-mono">{row.totalImpressions.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono">{row.totalClicks.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono">{row.totalResults.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono font-medium">{fmt(row.totalSpend)}</TableCell>
                            <TableCell className="text-right font-mono">{row.days}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <TablePagination totalItems={filteredSpend.length} pageSize={spendSize} currentPage={spendPage} onPageChange={setSpendPage} onPageSizeChange={(s) => { setSpendSize(s); setSpendPage(1); }} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
