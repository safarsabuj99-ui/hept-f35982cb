import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format } from "date-fns";

interface DayData { date: string; spend: number; }

interface SpendTrendChartProps {
  clientId?: string;
  dateRange?: { from: Date; to: Date } | null;
}

export function SpendTrendChart({ clientId, dateRange }: SpendTrendChartProps) {
  const { authReady } = useAuth();
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authReady) return;
    const fetch = async () => {
      setLoading(true);

      // Step 1: Get mapped accounts WITH keywords
      const { data: mappedAssignments } = await supabase
        .from("ad_account_clients")
        .select("ad_account_id, client_id, mapping_keyword")
        .neq("mapping_keyword", "");

      const mappedAccountIds = [...new Set(mappedAssignments?.map((r: any) => r.ad_account_id) || [])];

      if (mappedAccountIds.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const fromDate = dateRange ? format(dateRange.from, "yyyy-MM-dd") : null;
      const toDate = dateRange ? format(dateRange.to, "yyyy-MM-dd") : null;

      let spendQuery = clientId
        ? supabase
            .from("daily_ad_spend")
            .select("date, final_billable_usd")
            .eq("client_id", clientId)
            .order("date", { ascending: true })
        : supabase
            .from("daily_ad_spend")
            .select("date, final_billable_usd")
            .in("ad_account_id", mappedAccountIds)
            .order("date", { ascending: true });

      if (fromDate && toDate) {
        spendQuery = spendQuery.gte("date", fromDate).lte("date", toDate);
      }

      const spendData = await fetchAllRows<any>(() => spendQuery);

      const grouped: Record<string, number> = {};
      for (const row of spendData ?? []) {
        grouped[row.date] = (grouped[row.date] || 0) + Number(row.final_billable_usd);
      }

      setData(
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, spend]) => ({ date, spend: Math.round(spend * 100) / 100 }))
      );
      setLoading(false);
    };
    fetch();
  }, [clientId, dateRange, authReady]);

  if (loading) return <Skeleton className="h-[320px]" />;
  if (data.length === 0) return null;

  return (
    <Card className="dark:bg-card/80 dark:backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Spend Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              formatter={(value: number) => [`$${value.toFixed(2)}`, "Spend"]}
              labelFormatter={(l) => new Date(l).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
            />
            <Area type="monotone" dataKey="spend" stroke="hsl(var(--primary))" fill="url(#spendGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
