import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface DayData { date: string; spend: number; }

export function SpendTrendChart({ clientId }: { clientId?: string }) {
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      let query = supabase.from("daily_ad_spend" as any).select("date, final_billable_usd, ad_account_id") as any;

      if (clientId) {
        const { data: accounts } = await supabase
          .from("ad_accounts" as any)
          .select("id")
          .eq("client_id", clientId) as any;
        const ids = accounts?.map((a: any) => a.id) ?? [];
        if (ids.length > 0) {
          query = query.in("ad_account_id", ids);
        }
      }

      const { data: spendData } = await query.order("date", { ascending: true });

      const grouped: Record<string, number> = {};
      for (const row of spendData ?? []) {
        const d = row.date;
        grouped[d] = (grouped[d] || 0) + Number(row.final_billable_usd);
      }

      setData(
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-30)
          .map(([date, spend]) => ({ date, spend: Math.round(spend * 100) / 100 }))
      );
      setLoading(false);
    };
    fetch();
  }, [clientId]);

  if (loading) return <Skeleton className="h-64" />;
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Spend Trend (Last 30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, "Spend"]} labelFormatter={(l) => new Date(l).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} />
            <Line type="monotone" dataKey="spend" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
