import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Filter, FileText, BarChart3, Search, DollarSign, Eye, MousePointerClick, TrendingUp } from "lucide-react";
import { TablePagination } from "@/components/TablePagination";
import { DateRangeFilter, DateRange, getLocalToday } from "@/components/DateRangeFilter";
import { TableSkeleton } from "@/components/ui/premium-skeletons";

export default function CampaignMapping() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | null>(() => { const t = getUtcToday(); return { from: t, to: t }; });
  const [saving, setSaving] = useState<string | null>(null);
  const [spendPage, setSpendPage] = useState(1);
  const [spendSize, setSpendSize] = useState(20);
  const { toast } = useToast();

  const fetchData = async () => {
    const [{ data: camps }, { data: metricData }, { data: roles }, { data: profiles }, { data: accounts }] = await Promise.all([
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("daily_metrics").select("*").order("data_date", { ascending: false }),
      supabase.from("user_roles").select("user_id").eq("role", "client"),
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("ad_accounts").select("id, account_name, ad_account_id"),
    ]);
    setCampaigns(camps ?? []);
    setMetrics(metricData ?? []);
    setAdAccounts(accounts ?? []);
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

  const getAdAccountName = (adAccountId: string) =>
    adAccounts.find((a: any) => a.id === adAccountId)?.account_name || adAccounts.find((a: any) => a.id === adAccountId)?.ad_account_id || "—";

  const getClientName = (clientId: string | null) =>
    clients.find((c: any) => c.user_id === clientId)?.full_name ?? "—";

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
      if (statusFilter !== "all" && row.campaign.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const clientName = getClientName(row.campaign.client_id).toLowerCase();
        const accountName = getAdAccountName(row.campaign.ad_account_id).toLowerCase();
        if (
          !row.campaign.name?.toLowerCase().includes(q) &&
          !row.campaign.platform_id?.toLowerCase().includes(q) &&
          !clientName.includes(q) &&
          !accountName.includes(q)
        ) return false;
      }
      return true;
    });
  }, [aggregatedRows, platformFilter, clientFilter, statusFilter, searchQuery]);

  const fmt = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const fmtNum = (n: number) => n.toLocaleString("en-US");

  const totalSpend = filteredSpend.reduce((s, r) => s + r.totalSpend, 0);
  const totalImpressions = filteredSpend.reduce((s, r) => s + r.totalImpressions, 0);
  const totalClicks = filteredSpend.reduce((s, r) => s + r.totalClicks, 0);
  const avgRoas = filteredSpend.length > 0
    ? filteredSpend.reduce((s, r) => s + (r.totalSpend > 0 ? r.totalConversionValue / r.totalSpend : 0), 0) / filteredSpend.length
    : 0;

  const statusColors: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    paused: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    not_delivering: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    archived: "bg-muted text-muted-foreground border-muted",
  };

  useEffect(() => { setSpendPage(1); }, [platformFilter, clientFilter, statusFilter, searchQuery, dateRange]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
        <p className="text-muted-foreground">Unified spend analytics & campaign management</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap gap-4 pt-6">
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Campaign, account, client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
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
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="not_delivering">Not Delivering</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date Range</Label>
            <DateRangeFilter onRangeChange={(range) => setDateRange(range)} />
          </div>
        </CardContent>
      </Card>

      {/* KPI Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmt(totalSpend)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Impressions</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmtNum(totalImpressions)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Clicks</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmtNum(totalClicks)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. ROAS</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{avgRoas.toFixed(2)}x</p></CardContent>
        </Card>
      </div>

      {/* Unified Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <TableSkeleton rows={6} columns={10} />
          ) : filteredSpend.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <FileText className="h-10 w-10" />
              <p>No campaign data found. Adjust filters or run a sync.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Ad Account</TableHead>
                      <TableHead>Platform</TableHead>
                      {isAdmin && <TableHead>Client</TableHead>}
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Impressions</TableHead>
                      <TableHead className="text-right">Clicks</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead className="text-right">Results</TableHead>
                      <TableHead className="text-right">ROAS</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">Days</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSpend.slice((spendPage - 1) * spendSize, spendPage * spendSize).map((row, idx) => {
                      const ctr = row.totalImpressions > 0 ? (row.totalClicks / row.totalImpressions) * 100 : 0;
                      const roas = row.totalSpend > 0 ? row.totalConversionValue / row.totalSpend : 0;
                      const statusClass = statusColors[row.campaign.status] || statusColors.active;

                      return (
                        <TableRow key={row.campaign.id || idx}>
                          <TableCell className="max-w-[200px] truncate font-medium" title={row.campaign.name}>
                            {row.campaign.name}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                            {getAdAccountName(row.campaign.ad_account_id)}
                          </TableCell>
                          <TableCell><Badge variant="secondary" className="capitalize">{row.campaign.platform}</Badge></TableCell>
                          {isAdmin && (
                            <TableCell>
                              <Select
                                value={row.campaign.client_id || "unassigned"}
                                onValueChange={(v) => assignClient(row.campaign.id, v)}
                                disabled={saving === row.campaign.id}
                              >
                                <SelectTrigger className="w-36 h-8 text-xs">
                                  {saving === row.campaign.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <SelectValue placeholder="Assign..." />
                                  )}
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">Unassigned</SelectItem>
                                  {clients.map((c: any) => (
                                    <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          )}
                          <TableCell>
                            <Badge variant="outline" className={`text-xs capitalize ${statusClass}`}>
                              {row.campaign.status?.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">{fmtNum(row.totalImpressions)}</TableCell>
                          <TableCell className="text-right font-mono">{fmtNum(row.totalClicks)}</TableCell>
                          <TableCell className="text-right font-mono">{ctr.toFixed(2)}%</TableCell>
                          <TableCell className="text-right font-mono">{fmtNum(row.totalResults)}</TableCell>
                          <TableCell className="text-right font-mono">{roas.toFixed(2)}x</TableCell>
                          <TableCell className="text-right font-mono font-medium">{fmt(row.totalSpend)}</TableCell>
                          <TableCell className="text-right font-mono">{row.days}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <TablePagination totalItems={filteredSpend.length} pageSize={spendSize} currentPage={spendPage} onPageChange={setSpendPage} onPageSizeChange={(s) => { setSpendSize(s); setSpendPage(1); }} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
