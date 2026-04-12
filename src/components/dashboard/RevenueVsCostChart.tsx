import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format } from "date-fns";

interface DayData {
  date: string;
  rawCost: number;
  billed: number;
}

interface RevenueVsCostChartProps {
  dateRange?: { from: Date; to: Date } | null;
}

export function RevenueVsCostChart({ dateRange }: RevenueVsCostChartProps) {
  const { authReady } = useAuth();
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authReady) return;
    const fetchData = async () => {
      setLoading(true);

      // Step 1: Get mapped accounts WITH keywords
      const { data: mappedAssignments } = await supabase
        .from("ad_account_clients")
        .select("ad_account_id")
        .neq("mapping_keyword", "");

      const mappedAccountIds = [...new Set(mappedAssignments?.map((r: any) => r.ad_account_id) || [])];

      if (mappedAccountIds.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      let query = supabase
        .from("daily_ad_spend")
        .select("date, raw_spend_amount, raw_currency, exchange_rate_used, final_billable_usd, ad_account_id")
        .in("ad_account_id", mappedAccountIds)
        .order("date", { ascending: true });

      if (dateRange) {
        query = query
          .gte("date", format(dateRange.from, "yyyy-MM-dd"))
          .lte("date", format(dateRange.to, "yyyy-MM-dd"));
      }

      const { data: spendData } = await query;

      const grouped: Record<string, { rawCost: number; billed: number }> = {};
      for (const row of spendData ?? []) {
        const d = row.date;
        if (!grouped[d]) grouped[d] = { rawCost: 0, billed: 0 };
        const rawUsd = row.raw_currency === "BDT"
          ? Number(row.raw_spend_amount) / Number(row.exchange_rate_used)
          : Number(row.raw_spend_amount);
        grouped[d].rawCost += rawUsd;
        grouped[d].billed += Number(row.final_billable_usd);
      }

      setData(
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({
            date,
            rawCost: Math.round(v.rawCost * 100) / 100,
            billed: Math.round(v.billed * 100) / 100,
          }))
      );
      setLoading(false);
    };
    fetchData();
  }, [dateRange, authReady]);

  if (loading) return <Skeleton className="h-[320px]" />;
  if (data.length === 0) return null;

  return (
    <Card className="dark:bg-card/80 dark:backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Revenue vs Cost</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name === "rawCost" ? "Raw Cost" : "Billed"]}
              labelFormatter={(l) => new Date(l).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
            />
            <Area type="monotone" dataKey="rawCost" stroke="hsl(var(--destructive))" fill="url(#costGrad)" strokeWidth={2} />
            <Area type="monotone" dataKey="billed" stroke="hsl(var(--success))" fill="url(#revenueGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
