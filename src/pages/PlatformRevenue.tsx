import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, DollarSign, Users, BarChart3, Percent } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Area, AreaChart } from "recharts";

interface Sub { id: string; org_id: string; plan: string; amount_bdt: number; billing_cycle: string; payment_status: string; current_period_start: string; current_period_end: string; }
interface Org { id: string; name: string; status: string; plan: string; created_at: string; }
interface MrrSnapshot { snapshot_month: string; total_mrr: number; new_mrr: number; churned_mrr: number; expansion_mrr: number; contraction_mrr: number; active_count: number; }

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
      setSubs((subData ?? []) as Sub[]); setOrgs((orgData ?? []) as Org[]); setSnapshots(((snapData as any[]) ?? []) as MrrSnapshot[]); setLoading(false);
    };
    fetch();
  }, []);

  const metrics = useMemo(() => {
    const activeSubs = subs.filter((s) => s.payment_status === "paid" || s.payment_status === "pending");
    const mrr = activeSubs.reduce((sum, s) => sum + (s.billing_cycle === "yearly" ? s.amount_bdt / 12 : s.amount_bdt), 0);
    const arr = mrr * 12;
    const activeOrgs = orgs.filter((o) => o.status === "active" || o.status === "trial");
    const arpa = activeOrgs.length > 0 ? mrr / activeOrgs.length : 0;
    const cancelledOrgs = orgs.filter((o) => o.status === "cancelled" || o.status === "suspended");
    const churnRate = orgs.length > 0 ? (cancelledOrgs.length / orgs.length) * 100 : 0;
    const planRevenue: Record<string, number> = {};
    activeSubs.forEach((s) => { const monthly = s.billing_cycle === "yearly" ? s.amount_bdt / 12 : s.amount_bdt; planRevenue[s.plan] = (planRevenue[s.plan] || 0) + monthly; });
    const planBreakdown = Object.entries(planRevenue).map(([plan, amount]) => ({ plan, amount: Math.round(amount) }));
    const churned = cancelledOrgs.map((o) => {
      const sub = activeSubs.find((s) => s.org_id === o.id);
      return { id: o.id, name: o.name, plan: o.plan, status: o.status, lostMrr: sub ? (sub.billing_cycle === "yearly" ? sub.amount_bdt / 12 : sub.amount_bdt) : 0 };
    });
    const lastTwo = snapshots.slice(-2);
    const mrrGrowth = lastTwo.length === 2 && lastTwo[0].total_mrr > 0 ? ((lastTwo[1].total_mrr - lastTwo[0].total_mrr) / lastTwo[0].total_mrr) * 100 : 0;
    const nrr = mrr > 0 ? 100 + mrrGrowth : 100;
    return { mrr, arr, arpa, churnRate, mrrGrowth, nrr, planBreakdown, churned, activeCount: activeOrgs.length };
  }, [subs, orgs, snapshots]);

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-3 grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Revenue Analytics" subtitle="MRR/ARR metrics, growth trends, and revenue breakdown" icon={<TrendingUp className="h-6 w-6 text-primary" />} />

      <div>
        <p className="section-label mb-3">Revenue KPIs</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard title="MRR" value={`৳${Math.round(metrics.mrr).toLocaleString()}`} icon={DollarSign} trend={metrics.mrrGrowth !== 0 ? { value: `${Math.abs(metrics.mrrGrowth).toFixed(1)}%`, positive: metrics.mrrGrowth >= 0 } : null} staggerIndex={0} />
          <KpiCard title="ARR" value={`৳${Math.round(metrics.arr).toLocaleString()}`} icon={BarChart3} staggerIndex={1} />
          <KpiCard title="ARPA" value={`৳${Math.round(metrics.arpa).toLocaleString()}`} icon={Users} staggerIndex={2} />
          <KpiCard title="Churn Rate" value={`${metrics.churnRate.toFixed(1)}%`} icon={TrendingDown} accentColor="hsl(var(--destructive))" staggerIndex={3} />
          <KpiCard title="Active Tenants" value={String(metrics.activeCount)} icon={Users} accentColor="hsl(var(--success))" staggerIndex={4} />
          <KpiCard title="Net Revenue Retention" value={`${metrics.nrr.toFixed(1)}%`} icon={Percent} staggerIndex={5} />
        </div>
      </div>

      <div>
        <p className="section-label mb-3">Trends</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader><CardTitle className="text-sm">MRR Trend</CardTitle></CardHeader>
              <CardContent>
                {snapshots.length > 0 ? (
                  <ChartContainer config={{ mrr: { label: "MRR", color: "hsl(var(--primary))" } }} className="h-[250px]">
                    <AreaChart data={snapshots.map((s) => ({ month: s.snapshot_month.slice(0, 7), mrr: s.total_mrr }))}>
                      <defs><linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area type="monotone" dataKey="mrr" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#mrrGrad)" />
                    </AreaChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">No snapshot data yet.</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader><CardTitle className="text-sm">Revenue by Plan</CardTitle></CardHeader>
              <CardContent>
                {metrics.planBreakdown.length > 0 ? (
                  <ChartContainer config={{ amount: { label: "Monthly Revenue", color: "hsl(var(--primary))" } }} className="h-[250px]">
                    <BarChart data={metrics.planBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="plan" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">No active subscriptions</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div>
        <p className="section-label mb-3">Churned Agencies</p>
        <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "400ms", animationFillMode: "forwards" }}>
          <Card className="border-0 bg-transparent shadow-none">
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Agency</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead>Lost MRR</TableHead></TableRow></TableHeader>
                <TableBody>
                  {metrics.churned.map((c) => (
                    <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell><Badge variant="outline">{c.plan}</Badge></TableCell>
                      <TableCell><Badge variant={c.status === "cancelled" ? "destructive" : "secondary"}>{c.status}</Badge></TableCell>
                      <TableCell className="text-destructive font-medium font-mono">{c.lostMrr > 0 ? `৳${Math.round(c.lostMrr).toLocaleString()}` : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {metrics.churned.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No churned agencies 🎉</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
