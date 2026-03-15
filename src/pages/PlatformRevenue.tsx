import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Users, BarChart3, Percent } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface Sub {
  id: string;
  org_id: string;
  plan: string;
  amount_bdt: number;
  billing_cycle: string;
  payment_status: string;
  current_period_start: string;
  current_period_end: string;
}

interface Org {
  id: string;
  name: string;
  status: string;
  plan: string;
  created_at: string;
}

interface MrrSnapshot {
  snapshot_month: string;
  total_mrr: number;
  new_mrr: number;
  churned_mrr: number;
  expansion_mrr: number;
  contraction_mrr: number;
  active_count: number;
}

export default function PlatformRevenue() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [snapshots, setSnapshots] = useState<MrrSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [{ data: subData }, { data: orgData }, { data: snapData }] = await Promise.all([
        supabase.from("organization_subscriptions").select("*"),
        supabase.from("organizations").select("id, name, status, plan, created_at"),
        supabase.from("mrr_snapshots" as any).select("*").order("snapshot_month", { ascending: true }),
      ]);
      setSubs((subData ?? []) as Sub[]);
      setOrgs((orgData ?? []) as Org[]);
      setSnapshots(((snapData as any[]) ?? []) as MrrSnapshot[]);
      setLoading(false);
    };
    fetch();
  }, []);

  const metrics = useMemo(() => {
    const activeSubs = subs.filter((s) => s.payment_status === "paid" || s.payment_status === "pending");
    const orgMap = new Map(orgs.map((o) => [o.id, o]));

    // MRR = sum of monthly-equivalent amounts for active subs
    const mrr = activeSubs.reduce((sum, s) => {
      const monthly = s.billing_cycle === "yearly" ? s.amount_bdt / 12 : s.amount_bdt;
      return sum + monthly;
    }, 0);
    const arr = mrr * 12;

    const activeOrgs = orgs.filter((o) => o.status === "active" || o.status === "trial");
    const arpa = activeOrgs.length > 0 ? mrr / activeOrgs.length : 0;

    const cancelledOrgs = orgs.filter((o) => o.status === "cancelled" || o.status === "suspended");
    const churnRate = orgs.length > 0 ? (cancelledOrgs.length / orgs.length) * 100 : 0;

    // Revenue by plan
    const planRevenue: Record<string, number> = {};
    activeSubs.forEach((s) => {
      const monthly = s.billing_cycle === "yearly" ? s.amount_bdt / 12 : s.amount_bdt;
      planRevenue[s.plan] = (planRevenue[s.plan] || 0) + monthly;
    });
    const planBreakdown = Object.entries(planRevenue).map(([plan, amount]) => ({ plan, amount: Math.round(amount) }));

    // Churned agencies
    const churned = cancelledOrgs.map((o) => ({
      id: o.id,
      name: o.name,
      plan: o.plan,
      status: o.status,
      lostMrr: activeSubs.find((s) => s.org_id === o.id)
        ? (activeSubs.find((s) => s.org_id === o.id)!.billing_cycle === "yearly"
          ? activeSubs.find((s) => s.org_id === o.id)!.amount_bdt / 12
          : activeSubs.find((s) => s.org_id === o.id)!.amount_bdt)
        : 0,
    }));

    // Last month growth (simple estimation from snapshots)
    const lastTwo = snapshots.slice(-2);
    const mrrGrowth = lastTwo.length === 2 && lastTwo[0].total_mrr > 0
      ? ((lastTwo[1].total_mrr - lastTwo[0].total_mrr) / lastTwo[0].total_mrr) * 100
      : 0;

    const nrr = mrr > 0 ? 100 + mrrGrowth : 100;

    return { mrr, arr, arpa, churnRate, mrrGrowth, nrr, planBreakdown, churned, activeCount: activeOrgs.length };
  }, [subs, orgs, snapshots]);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const kpis = [
    { label: "MRR", value: `৳${Math.round(metrics.mrr).toLocaleString()}`, icon: DollarSign, trend: metrics.mrrGrowth },
    { label: "ARR", value: `৳${Math.round(metrics.arr).toLocaleString()}`, icon: BarChart3 },
    { label: "ARPA", value: `৳${Math.round(metrics.arpa).toLocaleString()}`, icon: Users },
    { label: "Churn Rate", value: `${metrics.churnRate.toFixed(1)}%`, icon: TrendingDown, negative: true },
    { label: "Active Tenants", value: metrics.activeCount.toString(), icon: Users },
    { label: "Net Revenue Retention", value: `${metrics.nrr.toFixed(1)}%`, icon: Percent },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Revenue Analytics</h1>
        <p className="text-sm text-muted-foreground">MRR/ARR metrics, growth trends, and revenue breakdown</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-xl font-bold text-foreground">{kpi.value}</p>
              {kpi.trend !== undefined && (
                <div className={`flex items-center gap-1 text-xs mt-1 ${kpi.trend >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                  {kpi.trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(kpi.trend).toFixed(1)}% vs last month
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* MRR Trend Chart */}
        <Card>
          <CardHeader><CardTitle className="text-sm">MRR Trend</CardTitle></CardHeader>
          <CardContent>
            {snapshots.length > 0 ? (
              <ChartContainer config={{ mrr: { label: "MRR", color: "hsl(var(--primary))" } }} className="h-[250px]">
                <LineChart data={snapshots.map((s) => ({ month: s.snapshot_month.slice(0, 7), mrr: s.total_mrr }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="mrr" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
                No snapshot data yet. Snapshots are recorded monthly.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue by Plan */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Revenue by Plan</CardTitle></CardHeader>
          <CardContent>
            {metrics.planBreakdown.length > 0 ? (
              <ChartContainer
                config={{
                  amount: { label: "Monthly Revenue", color: "hsl(var(--primary))" },
                }}
                className="h-[250px]"
              >
                <BarChart data={metrics.planBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="plan" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
                No active subscriptions
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Churned Agencies Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Churned / Suspended Agencies</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agency</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lost MRR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.churned.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><Badge variant="outline">{c.plan}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={c.status === "cancelled" ? "destructive" : "secondary"}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-destructive font-medium">
                    {c.lostMrr > 0 ? `৳${Math.round(c.lostMrr).toLocaleString()}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {metrics.churned.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No churned agencies 🎉</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
