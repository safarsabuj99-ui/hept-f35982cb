import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      let campaignIds: string[] = [];

      if (clientId) {
        const { data: links } = await supabase
          .from("ad_account_clients")
          .select("ad_account_id")
          .eq("client_id", clientId);
        const accIds = links?.map((l: any) => l.ad_account_id) ?? [];
        if (accIds.length > 0) {
          const { data: camps } = await supabase
            .from("campaigns")
            .select("id")
            .in("ad_account_id", accIds);
          campaignIds = camps?.map((c: any) => c.id) ?? [];
        }
      } else {
        const { data: camps } = await supabase.from("campaigns").select("id");
        campaignIds = camps?.map((c: any) => c.id) ?? [];
      }

      if (campaignIds.length === 0) { setData([]); setLoading(false); return; }

      let query = supabase
        .from("daily_metrics")
        .select("data_date, spend")
        .in("campaign_id", campaignIds)
        .order("data_date", { ascending: true });

      if (dateRange) {
        query = query
          .gte("data_date", format(dateRange.from, "yyyy-MM-dd"))
          .lte("data_date", format(dateRange.to, "yyyy-MM-dd"));
      }

      const { data: metricsData } = await query;

      const grouped: Record<string, number> = {};
      for (const row of metricsData ?? []) {
        grouped[row.data_date] = (grouped[row.data_date] || 0) + Number(row.spend);
      }

      setData(
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, spend]) => ({ date, spend: Math.round(spend * 100) / 100 }))
      );
      setLoading(false);
    };
    fetch();
  }, [clientId, dateRange]);

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
