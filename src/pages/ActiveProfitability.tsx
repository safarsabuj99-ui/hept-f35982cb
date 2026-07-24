import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { DateRangeFilter, DateRange, DatePreset, getLocalToday } from "@/components/DateRangeFilter";
import { TablePagination } from "@/components/TablePagination";
import { useActiveProfitability } from "@/hooks/useActiveProfitability";
import { usePermissions } from "@/hooks/usePermissions";
import { TrendingUp, DollarSign, Wallet, Users, Building2, Loader2, RefreshCw, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { KpiCard } from "@/components/dashboard/KpiCard";

const PLATFORM_COLORS: Record<string, string> = {
  meta: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  tiktok: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  google: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

const bdt = (n: number) => `৳${(Number(n) || 0).toLocaleString("en-US")}`;
const usd = (n: number) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

function PlatformBadges({ platforms }: { platforms: string }) {
  const list = (platforms || "").split(",").map((p) => p.trim()).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((p) => (
        <Badge key={p} variant="outline" className={`text-[10px] ${PLATFORM_COLORS[p] || ""}`}>
          {p}
        </Badge>
      ))}
    </div>
  );
}

export default function ActiveProfitability() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission("can_view_profit");
  const queryClient = useQueryClient();

  const [dateRange, setDateRange] = useState<DateRange | null>(() => {
    const t = getLocalToday();
    return { from: t, to: t };
  });
  const [tab, setTab] = useState<"client" | "account">("client");
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading, isFetching } = useActiveProfitability(dateRange);

  const handleDateChange = (r: DateRange | null, _p: DatePreset) => {
    setDateRange(r);
    setPage(1);
  };

  const handleRefresh = () =>
    queryClient.invalidateQueries({ queryKey: ["active-profitability"] });

  const filteredAccounts = useMemo(() => {
    let rows = data?.by_account ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.account_name?.toLowerCase().includes(q) ||
          r.client_name?.toLowerCase().includes(q)
      );
    }
    if (platformFilter !== "all") {
      rows = rows.filter((r) => (r.platforms || "").includes(platformFilter));
    }
    return rows;
  }, [data, search, platformFilter]);

  const filteredClients = useMemo(() => {
    let rows = data?.by_client ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.client_name?.toLowerCase().includes(q));
    }
    return rows;
  }, [data, search]);

  const pagedAccounts = filteredAccounts.slice((page - 1) * pageSize, page * pageSize);
  const pagedClients = filteredClients.slice((page - 1) * pageSize, page * pageSize);

  if (!canView) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        You do not have permission to view profitability data.
      </div>
    );
  }

  const totals = data?.totals;
  const marginPct =
    totals && totals.revenue_bdt > 0
      ? Math.round((totals.profit_bdt / totals.revenue_bdt) * 1000) / 10
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Active Profitability"
        subtitle="Only ad accounts with currently-running campaigns and spend in the selected range"
        icon={<TrendingUp className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <DateRangeFilter onRangeChange={handleDateChange} />

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Active Ad Accounts"
          value={String(totals?.active_accounts ?? 0)}
          icon={Building2}
          loading={isLoading}
          accentColor="hsl(var(--chart-meta))"
        />
        <KpiCard
          title="Active Clients"
          value={String(totals?.active_clients ?? 0)}
          icon={Users}
          loading={isLoading}
          accentColor="hsl(var(--primary))"
        />
        <KpiCard
          title="Total Spend"
          value={usd(totals?.spend_usd ?? 0)}
          subtitle="USD"
          icon={DollarSign}
          loading={isLoading}
          accentColor="hsl(var(--destructive))"
        />
        <KpiCard
          title="Total Profit"
          value={bdt(totals?.profit_bdt ?? 0)}
          subtitle={`${marginPct >= 0 ? "+" : ""}${marginPct}% margin · WAC ৳${data?.wac ?? 0}`}
          icon={Wallet}
          loading={isLoading}
          accentColor="hsl(var(--success))"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">Breakdown</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-8 h-8 w-[180px]"
                />
              </div>
              {tab === "account" && (
                <select
                  className="h-8 rounded-md border bg-background text-xs px-2"
                  value={platformFilter}
                  onChange={(e) => {
                    setPlatformFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">All platforms</option>
                  <option value="meta">Meta</option>
                  <option value="tiktok">TikTok</option>
                  <option value="google">Google</option>
                </select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as "client" | "account");
              setPage(1);
            }}
          >
            <TabsList>
              <TabsTrigger value="client">By Client</TabsTrigger>
              <TabsTrigger value="account">By Ad Account</TabsTrigger>
            </TabsList>

            <TabsContent value="client" className="mt-4">
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : filteredClients.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No active clients with spend in this range.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[720px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead className="text-right">Active Accts</TableHead>
                          <TableHead className="text-right">Active Camp.</TableHead>
                          <TableHead className="text-right">Spend (USD)</TableHead>
                          <TableHead className="text-right">Revenue (BDT)</TableHead>
                          <TableHead className="text-right">Cost (BDT)</TableHead>
                          <TableHead className="text-right">Profit (BDT)</TableHead>
                          <TableHead className="text-right">Margin</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedClients.map((r) => (
                          <TableRow key={r.client_id}>
                            <TableCell className="font-medium">
                              <Link
                                to={`/admin/clients/${r.client_id}`}
                                className="hover:underline"
                              >
                                {r.client_name}
                              </Link>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{r.active_accounts}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{r.active_campaigns}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{usd(r.spend_usd)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{bdt(r.revenue_bdt)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{bdt(r.cogs_bdt)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{bdt(r.profit_bdt)}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={r.margin_pct >= 0 ? "default" : "destructive"} className="text-xs">
                                {r.margin_pct >= 0 ? "+" : ""}
                                {r.margin_pct}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <TablePagination
                    currentPage={page}
                    pageSize={pageSize}
                    totalItems={filteredClients.length}
                    onPageChange={setPage}
                    onPageSizeChange={(s) => {
                      setPageSize(s);
                      setPage(1);
                    }}
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="account" className="mt-4">
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : filteredAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No active ad accounts with spend in this range.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[860px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ad Account</TableHead>
                          <TableHead>Platform</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead className="text-right">Active Camp.</TableHead>
                          <TableHead className="text-right">Spend (USD)</TableHead>
                          <TableHead className="text-right">Revenue (BDT)</TableHead>
                          <TableHead className="text-right">Cost (BDT)</TableHead>
                          <TableHead className="text-right">Profit (BDT)</TableHead>
                          <TableHead className="text-right">Margin</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedAccounts.map((r) => (
                          <TableRow key={r.ad_account_id}>
                            <TableCell className="font-medium">
                              <Link
                                to={`/admin/ad-accounts/${r.ad_account_id}`}
                                className="hover:underline"
                              >
                                {r.account_name}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <PlatformBadges platforms={r.platforms} />
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {r.client_id ? (
                                <Link
                                  to={`/admin/clients/${r.client_id}`}
                                  className="hover:underline"
                                >
                                  {r.client_name}
                                </Link>
                              ) : (
                                r.client_name
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{r.active_campaigns}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{usd(r.spend_usd)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{bdt(r.revenue_bdt)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{bdt(r.cogs_bdt)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{bdt(r.profit_bdt)}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={r.margin_pct >= 0 ? "default" : "destructive"} className="text-xs">
                                {r.margin_pct >= 0 ? "+" : ""}
                                {r.margin_pct}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <TablePagination
                    currentPage={page}
                    pageSize={pageSize}
                    totalItems={filteredAccounts.length}
                    onPageChange={setPage}
                    onPageSizeChange={(s) => {
                      setPageSize(s);
                      setPage(1);
                    }}
                  />
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
