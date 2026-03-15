import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export default function PlatformBenchmarks() {
  const { data: orgs = [] } = useQuery({
    queryKey: ["bench-orgs"],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id, name, status");
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["bench-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("org_id");
      return data || [];
    },
  });

  const { data: adAccounts = [] } = useQuery({
    queryKey: ["bench-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("org_id");
      return data || [];
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["bench-campaigns"],
    queryFn: async () => {
      const { data } = await supabase.from("campaigns").select("org_id");
      return data || [];
    },
  });

  const { data: subs = [] } = useQuery({
    queryKey: ["bench-subs"],
    queryFn: async () => {
      const { data } = await supabase.from("organization_subscriptions").select("org_id, payment_status");
      return data || [];
    },
  });

  const benchmarks = useMemo(() => {
    if (!orgs.length) return null;

    const metrics = orgs.map((org) => ({
      clients: profiles.filter((p) => p.org_id === org.id).length,
      accounts: adAccounts.filter((a) => a.org_id === org.id).length,
      campaigns: campaigns.filter((c) => c.org_id === org.id).length,
      paid: subs.filter((s) => s.org_id === org.id && s.payment_status === "paid").length > 0,
    }));

    const calc = (arr: number[]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const avg = arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
      const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
      const median = sorted[Math.floor(sorted.length * 0.5)] || 0;
      return { avg, p90, median };
    };

    return {
      clients: calc(metrics.map((m) => m.clients)),
      accounts: calc(metrics.map((m) => m.accounts)),
      campaigns: calc(metrics.map((m) => m.campaigns)),
      paymentRate: Math.round((metrics.filter((m) => m.paid).length / metrics.length) * 100),
    };
  }, [orgs, profiles, adAccounts, campaigns, subs]);

  const distributionData = useMemo(() => {
    if (!orgs.length) return [];
    const buckets = [
      { range: "0", min: 0, max: 0 },
      { range: "1-5", min: 1, max: 5 },
      { range: "6-15", min: 6, max: 15 },
      { range: "16-30", min: 16, max: 30 },
      { range: "31+", min: 31, max: Infinity },
    ];
    return buckets.map((b) => ({
      range: b.range,
      agencies: orgs.filter((org) => {
        const count = profiles.filter((p) => p.org_id === org.id).length;
        return count >= b.min && count <= b.max;
      }).length,
    }));
  }, [orgs, profiles]);

  if (!benchmarks) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Trophy className="mx-auto h-12 w-12 mb-4 opacity-30" />
        <p>Loading benchmarks...</p>
      </div>
    );
  }

  const BenchmarkCard = ({ title, data }: { title: string; data: { avg: number; p90: number; median: number } }) => (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground text-sm">Average</span>
            <span className="font-bold">{data.avg}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-sm">Median</span>
            <span className="font-bold">{data.median}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-sm">Top 10%</span>
            <span className="font-bold text-primary">{data.p90}+</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Benchmark Reports</h1>
        <p className="text-muted-foreground">Anonymous cross-agency performance comparisons</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <BenchmarkCard title="Clients Managed" data={benchmarks.clients} />
        <BenchmarkCard title="Ad Accounts" data={benchmarks.accounts} />
        <BenchmarkCard title="Active Campaigns" data={benchmarks.campaigns} />
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Payment Regularity</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{benchmarks.paymentRate}%</p>
            <p className="text-xs text-muted-foreground">agencies with paid subscriptions</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Client Count Distribution</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={distributionData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="range" label={{ value: "Clients", position: "insideBottom", offset: -5 }} />
              <YAxis label={{ value: "Agencies", angle: -90, position: "insideLeft" }} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              <Bar dataKey="agencies" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
