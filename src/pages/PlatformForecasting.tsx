import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Loader2, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ResponsiveContainer, LineChart as ReLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Area, AreaChart } from "recharts";
import { format, parseISO } from "date-fns";

interface Forecast {
  month: string;
  projected_mrr: number;
  confidence_low: number;
  confidence_high: number;
}

export default function PlatformForecasting() {
  const { toast } = useToast();
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(false);

  const { data: snapshots = [] } = useQuery({
    queryKey: ["forecast-snapshots"],
    queryFn: async () => {
      const { data } = await supabase.from("mrr_snapshots").select("*").order("snapshot_month", { ascending: true });
      return data || [];
    },
  });

  const { data: subs = [] } = useQuery({
    queryKey: ["forecast-subs"],
    queryFn: async () => {
      const { data } = await supabase.from("organization_subscriptions").select("amount_bdt, billing_cycle, payment_status");
      return data || [];
    },
  });

  const currentMRR = subs
    .filter((s) => s.payment_status === "paid")
    .reduce((sum, s) => sum + (s.billing_cycle === "yearly" ? s.amount_bdt / 12 : s.amount_bdt), 0);

  const handleForecast = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("revenue-forecast", {
        body: {
          snapshots: snapshots.map((s) => ({ month: s.snapshot_month, mrr: s.total_mrr })),
          current_mrr: currentMRR,
        },
      });
      if (error) throw error;
      setForecasts(data?.forecasts || []);
      toast({ title: "Forecast generated" });
    } catch (e: any) {
      toast({ title: "Forecast failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const chartData = [
    ...snapshots.map((s) => ({
      month: format(parseISO(s.snapshot_month), "MMM yy"),
      actual: s.total_mrr,
      projected: null as number | null,
      low: null as number | null,
      high: null as number | null,
    })),
    ...forecasts.map((f) => ({
      month: f.month,
      actual: null as number | null,
      projected: f.projected_mrr,
      low: f.confidence_low,
      high: f.confidence_high,
    })),
  ];

  const proj3 = forecasts[2]?.projected_mrr;
  const proj6 = forecasts[5]?.projected_mrr;
  const proj12 = forecasts[11]?.projected_mrr;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revenue Forecasting</h1>
          <p className="text-muted-foreground">AI-powered MRR projections</p>
        </div>
        <Button onClick={handleForecast} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LineChart className="mr-2 h-4 w-4" />}
          {loading ? "Forecasting..." : "Generate Forecast"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Current MRR</p>
            <p className="text-2xl font-bold">৳{Math.round(currentMRR).toLocaleString()}</p>
          </CardContent>
        </Card>
        {proj3 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">3-Month Projection</p>
              <p className="text-2xl font-bold text-primary">৳{Math.round(proj3).toLocaleString()}</p>
            </CardContent>
          </Card>
        )}
        {proj6 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">6-Month Projection</p>
              <p className="text-2xl font-bold text-primary">৳{Math.round(proj6).toLocaleString()}</p>
            </CardContent>
          </Card>
        )}
        {proj12 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">12-Month Projection</p>
              <p className="text-2xl font-bold text-primary">৳{Math.round(proj12).toLocaleString()}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>MRR Trend & Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="mx-auto h-12 w-12 mb-4 opacity-30" />
              <p>Generate a forecast to see projections</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Area type="monotone" dataKey="high" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.1} />
                <Area type="monotone" dataKey="low" stroke="none" fill="hsl(var(--background))" fillOpacity={1} />
                <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="projected" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
