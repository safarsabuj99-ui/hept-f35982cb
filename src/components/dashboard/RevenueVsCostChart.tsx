import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface DayData {
  date: string;
  rawCost: number;
  billed: number;
}

export function RevenueVsCostChart() {
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: spendData } = await supabase
        .from("daily_ad_spend")
        .select("date, raw_spend_amount, raw_currency, exchange_rate_used, final_billable_usd")
        .order("date", { ascending: true });

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
          .slice(-30)
          .map(([date, v]) => ({
            date,
            rawCost: Math.round(v.rawCost * 100) / 100,
            billed: Math.round(v.billed * 100) / 100,
          }))
      );
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) return <Skeleton className="h-[320px]" />;
  if (data.length === 0) return null;

  return (
    <Card className="dark:bg-card/80 dark:backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Revenue vs Cost (30 Days)</CardTitle>
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
