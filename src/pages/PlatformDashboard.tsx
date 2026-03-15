import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, TrendingUp, Users, AlertTriangle, DollarSign, BarChart3, UserCheck } from "lucide-react";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface Stats {
  totalAgencies: number;
  activeAgencies: number;
  trialAgencies: number;
  suspendedAgencies: number;
  cancelledAgencies: number;
  mrr: number;
  totalRevenue: number;
  arpa: number;
  totalClients: number;
  totalAdSpend: number;
  planDistribution: { name: string; value: number; color: string }[];
  signupTrend: { month: string; count: number }[];
  upcomingRenewals: any[];
  overduePayments: any[];
}

const PLAN_COLORS: Record<string, string> = {
  starter: "hsl(var(--primary))",
  growth: "hsl(var(--warning))",
  agency_pro: "hsl(var(--success))",
};

export default function PlatformDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchStats = async () => {
      const [{ data: orgs }, { data: subs }, { data: clientRoles }, { data: invoices }] = await Promise.all([
        supabase.from("organizations").select("id, status, plan, created_at"),
        supabase.from("organization_subscriptions").select("org_id, amount_bdt, payment_status, billing_cycle, current_period_end"),
        supabase.from("user_roles").select("id").eq("role", "client"),
        supabase.from("platform_invoices" as any).select("id, org_id, amount_bdt, status, period_end").eq("status", "overdue"),
      ]);

      const totalAgencies = orgs?.length ?? 0;
      const activeAgencies = orgs?.filter((o) => o.status === "active").length ?? 0;
      const trialAgencies = orgs?.filter((o) => o.status === "trial").length ?? 0;
      const suspendedAgencies = orgs?.filter((o) => o.status === "suspended").length ?? 0;
      const cancelledAgencies = orgs?.filter((o) => o.status === "cancelled").length ?? 0;

      const paidSubs = subs?.filter((s) => s.payment_status === "paid") ?? [];
      const mrr = paidSubs.reduce((sum, s) => sum + (s.billing_cycle === "yearly" ? s.amount_bdt / 12 : s.amount_bdt), 0);
      const totalRevenue = paidSubs.reduce((sum, s) => sum + s.amount_bdt, 0);
      const arpa = activeAgencies > 0 ? mrr / activeAgencies : 0;

      // Plan distribution
      const planCounts: Record<string, number> = {};
      orgs?.forEach((o) => { planCounts[o.plan] = (planCounts[o.plan] || 0) + 1; });
      const planDistribution = Object.entries(planCounts).map(([name, value]) => ({
        name: name.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        value,
        color: PLAN_COLORS[name] || "hsl(var(--muted))",
      }));

      // Signup trend (last 6 months)
      const now = new Date();
      const signupTrend = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const monthKey = d.toISOString().slice(0, 7);
        const count = orgs?.filter((o) => o.created_at?.startsWith(monthKey)).length ?? 0;
        return { month: d.toLocaleString("default", { month: "short" }), count };
      });

      // Upcoming renewals (next 30 days)
      const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const upcomingRenewals = subs?.filter((s) => s.current_period_end >= today && s.current_period_end <= in30Days) ?? [];

      setStats({
        totalAgencies, activeAgencies, trialAgencies, suspendedAgencies, cancelledAgencies,
        mrr, totalRevenue, arpa,
        totalClients: clientRoles?.length ?? 0,
        totalAdSpend: 0,
        planDistribution, signupTrend, upcomingRenewals,
        overduePayments: (invoices as any[]) ?? [],
      });
      setLoading(false);
    };
    fetchStats();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const kpis = [
    { label: "MRR", value: `৳${Math.round(stats?.mrr ?? 0).toLocaleString()}`, sub: `ARR: ৳${Math.round((stats?.mrr ?? 0) * 12).toLocaleString()}`, icon: TrendingUp, color: "text-primary" },
    { label: "Active Agencies", value: stats?.activeAgencies ?? 0, sub: `${stats?.trialAgencies ?? 0} trial · ${stats?.suspendedAgencies ?? 0} suspended`, icon: Building2, color: "text-success" },
    { label: "Total Clients", value: stats?.totalClients ?? 0, sub: "Across all agencies", icon: Users, color: "text-accent-foreground" },
    { label: "ARPA", value: `৳${Math.round(stats?.arpa ?? 0).toLocaleString()}`, sub: "Avg Revenue / Agency", icon: DollarSign, color: "text-warning" },
    { label: "Total Revenue", value: `৳${Math.round(stats?.totalRevenue ?? 0).toLocaleString()}`, sub: "All-time collected", icon: BarChart3, color: "text-primary" },
    { label: "Overdue", value: stats?.overduePayments?.length ?? 0, sub: "Invoices overdue", icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Dashboard</h1>
        <p className="text-sm text-muted-foreground">Real-time overview of all agencies on the platform</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.label}</CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Plan Distribution */}
        <Card>
          <CardHeader><CardTitle className="text-base">Plan Distribution</CardTitle></CardHeader>
          <CardContent>
            {(stats?.planDistribution?.length ?? 0) > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={stats!.planDistribution} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                      {stats!.planDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {stats!.planDistribution.map((p) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-sm text-foreground">{p.name}</span>
                      <Badge variant="secondary" className="ml-auto">{p.value}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No agencies yet</p>
            )}
          </CardContent>
        </Card>

        {/* Agency Signups */}
        <Card>
          <CardHeader><CardTitle className="text-base">Agency Signups (Last 6 Months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={stats?.signupTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--popover-foreground))" }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upcoming Renewals */}
        <Card>
          <CardHeader><CardTitle className="text-base">Upcoming Renewals (30 Days)</CardTitle></CardHeader>
          <CardContent>
            {(stats?.upcomingRenewals?.length ?? 0) > 0 ? (
              <div className="space-y-2">
                {stats!.upcomingRenewals.map((r: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-sm border-b border-border pb-2 last:border-0">
                    <span className="text-foreground">{r.org_id?.slice(0, 8)}...</span>
                    <span className="text-muted-foreground">৳{r.amount_bdt?.toLocaleString()}</span>
                    <Badge variant="outline">{r.current_period_end}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No renewals in next 30 days</p>
            )}
          </CardContent>
        </Card>

        {/* Overdue Payments */}
        <Card>
          <CardHeader><CardTitle className="text-base text-destructive">Overdue Payments</CardTitle></CardHeader>
          <CardContent>
            {(stats?.overduePayments?.length ?? 0) > 0 ? (
              <div className="space-y-2">
                {stats!.overduePayments.map((inv: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-sm border-b border-border pb-2 last:border-0">
                    <span className="text-foreground">{inv.invoice_number || inv.org_id?.slice(0, 8)}</span>
                    <span className="text-destructive font-medium">৳{inv.amount_bdt?.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No overdue invoices 🎉</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
