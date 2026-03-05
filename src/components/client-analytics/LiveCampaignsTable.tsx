import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useImpersonation } from "@/hooks/useImpersonation";
import { useCurrency } from "@/hooks/useCurrency";
import { ClientDateFilter, ClientDateRange, ClientDatePreset } from "@/components/ClientDateFilter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpDown, TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";

interface AggregatedCampaign {
  campaignId: string;
  campaignName: string;
  adAccountName: string;
  adAccountId: string;
  platform: string;
  status: string;
  impressions: number;
  clicks: number;
  spend: number;
  results: number;
  conversionValue: number;
  cpm: number;
  ctr: number;
  cpc: number;
  roas: number;
}

const PLATFORM_ICONS: Record<string, { label: string; color: string }> = {
  meta: { label: "Meta", color: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  tiktok: { label: "TikTok", color: "bg-pink-500/10 text-pink-600 border-pink-500/30" },
  google: { label: "Google", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
};

function RoasBadge({ roas }: { roas: number }) {
  if (roas >= 3) return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-mono">{roas.toFixed(2)}x</Badge>;
  if (roas >= 1.5) return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 font-mono">{roas.toFixed(2)}x</Badge>;
  if (roas > 0) return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 font-mono">{roas.toFixed(2)}x</Badge>;
  return <span className="text-muted-foreground text-xs">—</span>;
}

function StatusDot({ status }: { status: string }) {
  const isActive = status.toLowerCase() === "active";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${isActive ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
      <span className="text-xs capitalize">{status}</span>
    </span>
  );
}

export function LiveCampaignsTable() {
  const { effectiveClientId } = useImpersonation();
  const { formatAmount } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<AggregatedCampaign[]>([]);
  const [dateRange, setDateRange] = useState<ClientDateRange | null>(null);
  const [datePreset, setDatePreset] = useState<ClientDatePreset>("this_month");
  const [sorting, setSorting] = useState<SortingState>([{ id: "spend", desc: true }]);

  useEffect(() => {
    if (!effectiveClientId) return;
    fetchData();
  }, [effectiveClientId, dateRange, datePreset]);

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Get client's ad account IDs
      const { data: aacData } = await supabase
        .from("ad_account_clients")
        .select("ad_account_id")
        .eq("client_id", effectiveClientId!);

      if (!aacData?.length) { setCampaigns([]); setLoading(false); return; }

      const accountIds = aacData.map(a => a.ad_account_id);

      // 2. Get ad accounts for names
      const { data: accounts } = await supabase
        .from("ad_accounts")
        .select("id, account_name, platform_name")
        .in("id", accountIds);

      const accountMap = new Map((accounts ?? []).map(a => [a.id, a]));

      // 3. Get campaigns
      const { data: campaignsData } = await supabase
        .from("campaigns")
        .select("id, name, status, ad_account_id, platform")
        .in("ad_account_id", accountIds);

      if (!campaignsData?.length) { setCampaigns([]); setLoading(false); return; }

      const campaignIds = campaignsData.map(c => c.id);

      // 4. Get daily_metrics with date filter
      let metricsQuery = supabase
        .from("daily_metrics")
        .select("campaign_id, impressions, clicks, spend, results, conversion_value")
        .in("campaign_id", campaignIds);

      if (dateRange) {
        metricsQuery = metricsQuery
          .gte("data_date", format(dateRange.from, "yyyy-MM-dd"))
          .lte("data_date", format(dateRange.to, "yyyy-MM-dd"));
      }

      const { data: metricsData } = await metricsQuery;

      // 5. Aggregate metrics per campaign
      const metricsMap = new Map<string, { impressions: number; clicks: number; spend: number; results: number; conversionValue: number }>();
      (metricsData ?? []).forEach((m: any) => {
        const existing = metricsMap.get(m.campaign_id) || { impressions: 0, clicks: 0, spend: 0, results: 0, conversionValue: 0 };
        existing.impressions += Number(m.impressions) || 0;
        existing.clicks += Number(m.clicks) || 0;
        existing.spend += Number(m.spend) || 0;
        existing.results += Number(m.results) || 0;
        existing.conversionValue += Number(m.conversion_value) || 0;
        metricsMap.set(m.campaign_id, existing);
      });

      // 6. Build final rows
      const rows: AggregatedCampaign[] = campaignsData.map(c => {
        const acc = accountMap.get(c.ad_account_id);
        const m = metricsMap.get(c.id) || { impressions: 0, clicks: 0, spend: 0, results: 0, conversionValue: 0 };
        return {
          campaignId: c.id,
          campaignName: c.name,
          adAccountName: acc?.account_name || "Unknown",
          adAccountId: c.ad_account_id,
          platform: c.platform,
          status: c.status,
          impressions: m.impressions,
          clicks: m.clicks,
          spend: m.spend,
          results: m.results,
          conversionValue: m.conversionValue,
          cpm: m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 0,
          ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
          cpc: m.clicks > 0 ? m.spend / m.clicks : 0,
          roas: m.spend > 0 ? m.conversionValue / m.spend : 0,
        };
      });

      setCampaigns(rows);
    } catch (err) {
      console.error("Failed to fetch live campaigns:", err);
    }
    setLoading(false);
  }

  const columns: ColumnDef<AggregatedCampaign>[] = useMemo(() => [
    {
      id: "platform",
      header: "",
      size: 80,
      cell: ({ row }) => {
        const p = PLATFORM_ICONS[row.original.platform] || PLATFORM_ICONS.meta;
        return <Badge variant="outline" className={`${p.color} text-[10px] px-1.5 py-0`}>{p.label}</Badge>;
      },
    },
    {
      accessorKey: "campaignName",
      header: ({ column }) => (
        <button className="flex items-center gap-1 hover:text-foreground" onClick={() => column.toggleSorting()}>
          Campaign <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-sm font-medium truncate max-w-[200px]">{row.original.campaignName}</p>
          <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{row.original.adAccountName}</p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 100,
      cell: ({ row }) => <StatusDot status={row.original.status} />,
    },
    {
      accessorKey: "impressions",
      header: ({ column }) => (
        <button className="flex items-center gap-1 hover:text-foreground" onClick={() => column.toggleSorting()}>
          Impressions <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.impressions.toLocaleString()}</span>,
    },
    {
      accessorKey: "cpm",
      header: "CPM",
      size: 80,
      cell: ({ row }) => <span className="font-mono text-sm">{formatAmount(row.original.cpm)}</span>,
    },
    {
      accessorKey: "results",
      header: ({ column }) => (
        <button className="flex items-center gap-1 hover:text-foreground" onClick={() => column.toggleSorting()}>
          Results <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.results.toLocaleString()}</span>,
    },
    {
      accessorKey: "spend",
      header: ({ column }) => (
        <button className="flex items-center gap-1 hover:text-foreground" onClick={() => column.toggleSorting()}>
          Spend <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{formatAmount(row.original.spend)}</span>,
    },
    {
      accessorKey: "roas",
      header: ({ column }) => (
        <button className="flex items-center gap-1 hover:text-foreground" onClick={() => column.toggleSorting()}>
          ROAS <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      size: 90,
      cell: ({ row }) => <RoasBadge roas={row.original.roas} />,
    },
  ], [formatAmount]);

  const table = useReactTable({
    data: campaigns,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Totals
  const totals = useMemo(() => {
    const t = campaigns.reduce((acc, c) => ({
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      spend: acc.spend + c.spend,
      results: acc.results + c.results,
      conversionValue: acc.conversionValue + c.conversionValue,
    }), { impressions: 0, clicks: 0, spend: 0, results: 0, conversionValue: 0 });
    return {
      ...t,
      cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0,
      roas: t.spend > 0 ? t.conversionValue / t.spend : 0,
    };
  }, [campaigns]);

  const handleDateChange = (range: ClientDateRange | null, preset: ClientDatePreset) => {
    setDateRange(range);
    setDatePreset(preset);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ClientDateFilter onRangeChange={handleDateChange} activePreset={datePreset} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Spend</p>
            <p className="text-xl font-bold font-mono">{formatAmount(totals.spend)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Impressions</p>
            <p className="text-xl font-bold font-mono">{totals.impressions.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Results</p>
            <p className="text-xl font-bold font-mono">{totals.results.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Avg ROAS</p>
            <RoasBadge roas={totals.roas} />
          </CardContent>
        </Card>
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <BarChart3 className="h-10 w-10 text-muted-foreground/40 mx-auto" />
            <p className="text-muted-foreground">No synced campaigns found</p>
            <p className="text-xs text-muted-foreground">Campaign data will appear here once your ad accounts are synced</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4 pb-2 px-0">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map(headerGroup => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <TableHead key={header.id} style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map(row => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {/* Totals Row */}
                <TableRow className="bg-muted/50 font-medium border-t-2">
                  <TableCell />
                  <TableCell className="text-sm">Total ({campaigns.length} campaigns)</TableCell>
                  <TableCell />
                  <TableCell className="font-mono text-sm">{totals.impressions.toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-sm">{formatAmount(totals.cpm)}</TableCell>
                  <TableCell className="font-mono text-sm">{totals.results.toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-sm font-bold">{formatAmount(totals.spend)}</TableCell>
                  <TableCell><RoasBadge roas={totals.roas} /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
