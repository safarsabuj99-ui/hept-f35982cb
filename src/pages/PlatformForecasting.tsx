import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { LineChart as LineChartIcon, Loader2, TrendingUp, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ResponsiveContainer, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Line } from "recharts";
import { format, parseISO } from "date-fns";

interface Forecast { month: string; projected_mrr: number; confidence_low: number; confidence_high: number; }

export default function PlatformForecasting() {
  const { toast } = useToast();
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(false);

  const { data: snapshots = [] } = useQuery({ queryKey: ["forecast-snapshots"], queryFn: async () => { const { data } = await supabase.from("mrr_snapshots").select("*").order("snapshot_month", { ascending: true }); return data || []; } });
  const { data: subs = [] } = useQuery({ queryKey: ["forecast-subs"], queryFn: async () => { const { data } = await supabase.from("organization_subscriptions").select("amount_bdt, billing_cycle, payment_status"); return data || []; } });

  const currentMRR = subs.filter((s) => s.payment_status === "paid").reduce((sum, s) => sum + (s.billing_cycle === "yearly" ? s.amount_bdt / 12 : s.amount_bdt), 0);

  const handleForecast = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("revenue-forecast", { body: { snapshots: snapshots.map((s) => ({ month: s.snapshot_month, mrr: s.total_mrr })), current_mrr: currentMRR } });
      if (error) throw error;
      setForecasts(data?.forecasts || []);
      toast({ title: "Forecast generated" });
    } catch (e: any) { toast({ title: "Forecast failed", description: e.message, variant: "destructive" }); } finally { setLoading(false); }
  };

  const chartData = [
    ...snapshots.map((s) => ({ month: format(parseISO(s.snapshot_month), "MMM yy"), actual: s.total_mrr, projected: null as number | null, low: null as number | null, high: null as number | null })),
    ...forecasts.map((f) => ({ month: f.month, actual: null as number | null, projected: f.projected_mrr, low: f.confidence_low, high: f.confidence_high })),
  ];

  const proj3 = forecasts[2]?.projected_mrr;
  const proj6 = forecasts[5]?.projected_mrr;
  const proj12 = forecasts[11]?.projected_mrr;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Revenue Forecasting"
        subtitle="AI-powered MRR projections"
        icon={<LineChartIcon className="h-6 w-6 text-primary" />}
        actions={
          <Button onClick={handleForecast} disabled={loading} className="press-effect">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LineChartIcon className="mr-2 h-4 w-4" />}
            {loading ? "Forecasting..." : "Generate Forecast"}
          </Button>
        }
      />

      <div>
        <p className="section-label mb-3">Projections</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KpiCard title="Current MRR" value={`৳${Math.round(currentMRR).toLocaleString()}`} icon={DollarSign} staggerIndex={0} />
          {proj3 && <KpiCard title="3-Month" value={`৳${Math.round(proj3).toLocaleString()}`} icon={TrendingUp} staggerIndex={1} />}
          {proj6 && <KpiCard title="6-Month" value={`৳${Math.round(proj6).toLocaleString()}`} icon={TrendingUp} staggerIndex={2} />}
          {proj12 && <KpiCard title="12-Month" value={`৳${Math.round(proj12).toLocaleString()}`} icon={TrendingUp} staggerIndex={3} />}
        </div>
      </div>

      <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader><CardTitle>MRR Trend & Forecast</CardTitle></CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="mx-auto h-12 w-12 mb-4 opacity-30" />
                <p>Generate a forecast to see projections</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
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
    </div>
  );
}
