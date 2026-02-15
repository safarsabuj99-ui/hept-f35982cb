import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown } from "lucide-react";

export function ProfitLossWidget() {
  const [data, setData] = useState<{ totalRaw: number; totalBillable: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: spendData } = await supabase
        .from("daily_ad_spend" as any)
        .select("raw_spend_amount, raw_currency, exchange_rate_used, final_billable_usd") as any;

      if (spendData) {
        let totalRaw = 0;
        let totalBillable = 0;
        for (const row of spendData) {
          const rawUsd = row.raw_currency === "BDT"
            ? Number(row.raw_spend_amount) / Number(row.exchange_rate_used)
            : Number(row.raw_spend_amount);
          totalRaw += rawUsd;
          totalBillable += Number(row.final_billable_usd);
        }
        setData({ totalRaw: Math.round(totalRaw * 100) / 100, totalBillable: Math.round(totalBillable * 100) / 100 });
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const margin = data ? data.totalBillable - data.totalRaw : 0;

  if (loading) return <Skeleton className="h-32" />;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Profit / Loss Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total Raw Cost (USD)</span>
          <span className="font-mono">{fmt(data?.totalRaw ?? 0)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total Client Billed</span>
          <span className="font-mono">{fmt(data?.totalBillable ?? 0)}</span>
        </div>
        <div className="flex justify-between border-t pt-2">
          <span className="font-medium">Margin</span>
          <span className={`flex items-center gap-1 font-mono font-bold ${margin >= 0 ? "text-success" : "text-destructive"}`}>
            {margin >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {fmt(Math.abs(margin))}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
