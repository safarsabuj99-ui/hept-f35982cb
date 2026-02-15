import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientDateFilter, ClientDateRange, ClientDatePreset } from "@/components/ClientDateFilter";
import { BarChart3, DollarSign, TrendingUp, Layers } from "lucide-react";

const PLATFORM_LABELS: Record<string, string> = { meta: "Meta", tiktok: "TikTok", google: "Google" };

export default function ClientReports() {
  const { user } = useAuth();
  const [adSpend, setAdSpend] = useState<any[]>([]);
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<ClientDateRange | null>(null);
  const [preset, setPreset] = useState<ClientDatePreset>("all_time");

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data: accounts } = await (supabase.from("ad_accounts" as any).select("*").eq("client_id", user.id) as any);
    setAdAccounts(accounts ?? []);
    const accIds = accounts?.map((a: any) => a.id) ?? [];
    if (accIds.length > 0) {
      const { data: spend } = await (supabase.from("daily_ad_spend" as any).select("*").in("ad_account_id", accIds).order("date", { ascending: false }) as any);
      setAdSpend(spend ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRangeChange = (range: ClientDateRange | null, p: ClientDatePreset) => {
    setDateRange(range);
    setPreset(p);
  };

  const filteredSpend = useMemo(() => {
    if (!dateRange) return adSpend;
    return adSpend.filter((s: any) => {
      const d = new Date(s.date);
      return d >= dateRange.from && d <= dateRange.to;
    });
  }, [adSpend, dateRange]);

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Daily breakdown grouped by date
  const dailyBreakdown = useMemo(() => {
    const map: Record<string, { date: string; total: number; platforms: Record<string, number> }> = {};
    for (const row of filteredSpend) {
      const acc = adAccounts.find((a: any) => a.id === row.ad_account_id);
      const platform = acc?.platform_name || "unknown";
      if (!map[row.date]) map[row.date] = { date: row.date, total: 0, platforms: {} };
      map[row.date].total += Number(row.final_billable_usd);
      map[row.date].platforms[platform] = (map[row.date].platforms[platform] || 0) + Number(row.final_billable_usd);
    }
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredSpend, adAccounts]);

  // Summary
  const totalSpend = filteredSpend.reduce((s: number, r: any) => s + Number(r.final_billable_usd), 0);
  const avgDaily = dailyBreakdown.length > 0 ? totalSpend / dailyBreakdown.length : 0;
  const platformTotals: Record<string, number> = {};
  for (const row of filteredSpend) {
    const acc = adAccounts.find((a: any) => a.id === row.ad_account_id);
    const platform = acc?.platform_name || "unknown";
    platformTotals[platform] = (platformTotals[platform] || 0) + Number(row.final_billable_usd);
  }
  const topPlatform = Object.entries(platformTotals).sort((a, b) => b[1] - a[1])[0];

  if (loading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Spend Reports
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Detailed breakdown of your ad spend</p>
      </div>

      <ClientDateFilter onRangeChange={handleRangeChange} activePreset={preset} />

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{fmt(totalSpend)}</p>
            <p className="text-xs text-muted-foreground mt-1">{dailyBreakdown.length} days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Daily Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{fmt(avgDaily)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <Layers className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Top Platform</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{topPlatform ? PLATFORM_LABELS[topPlatform[0]] || topPlatform[0] : "—"}</p>
            {topPlatform && <p className="text-xs text-muted-foreground mt-1">{fmt(topPlatform[1])}</p>}
          </CardContent>
        </Card>
      </div>

      {/* Platform Summary */}
      {Object.keys(platformTotals).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Platform Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(platformTotals).sort((a, b) => b[1] - a[1]).map(([p, v]) => (
                <div key={p} className="flex items-center gap-2 rounded-lg border px-4 py-3 min-w-[140px]">
                  <Badge variant="secondary">{PLATFORM_LABELS[p] || p}</Badge>
                  <span className="font-mono font-medium text-sm">{fmt(v)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Breakdown Table */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Daily Breakdown</CardTitle></CardHeader>
        <CardContent>
          {dailyBreakdown.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No spend data for this period</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Meta</TableHead>
                    <TableHead>TikTok</TableHead>
                    <TableHead>Google</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyBreakdown.map((row) => (
                    <TableRow key={row.date}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {new Date(row.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{row.platforms.meta ? fmt(row.platforms.meta) : "—"}</TableCell>
                      <TableCell className="font-mono text-sm">{row.platforms.tiktok ? fmt(row.platforms.tiktok) : "—"}</TableCell>
                      <TableCell className="font-mono text-sm">{row.platforms.google ? fmt(row.platforms.google) : "—"}</TableCell>
                      <TableCell className="text-right font-mono font-medium">{fmt(row.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
