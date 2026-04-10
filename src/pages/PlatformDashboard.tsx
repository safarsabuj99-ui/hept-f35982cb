import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Building2, TrendingUp, Users, AlertTriangle, DollarSign, BarChart3 } from "lucide-react";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

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
  const { user } = useAuth();
  const { profile } = useProfile();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Owner";

  useEffect(() => {
    const fetchStats = async () => {
      const [{ data: orgs }, { data: subs }, { data: clientRoles }, { data: invoices }] = await Promise.all([
        supabase.from("organizations").select("id, name, status, plan, created_at"),
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

      const planCounts: Record<string, number> = {};
      orgs?.forEach((o) => { planCounts[o.plan] = (planCounts[o.plan] || 0) + 1; });
      const planDistribution = Object.entries(planCounts).map(([name, value]) => ({
        name: name.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        value,
        color: PLAN_COLORS[name] || "hsl(var(--muted))",
      }));

      const now = new Date();
      const signupTrend = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const monthKey = d.toISOString().slice(0, 7);
        const count = orgs?.filter((o) => o.created_at?.startsWith(monthKey)).length ?? 0;
        return { month: d.toLocaleString("default", { month: "short" }), count };
      });

      const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const orgNameMap = new Map<string, string>();
      orgs?.forEach((o: any) => orgNameMap.set(o.id, o.name));
      const upcomingRenewals = (subs?.filter((s) => s.current_period_end >= today && s.current_period_end <= in30Days) ?? [])
        .map((r) => ({ ...r, org_name: orgNameMap.get(r.org_id) ?? r.org_id.slice(0, 8) }));

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

  return (
    <div className="space-y-8">
      {/* Premium Header */}
      <div className="flex flex-col gap-3 animate-slide-up-fade" style={{ animationFillMode: "forwards" }}>
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            <span className="inline-block typewriter">{greeting}, </span>
            <span className="text-primary">{displayName}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="stat-pill opacity-0 animate-scale-bounce" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono">{stats?.activeAgencies ?? 0}</span> Active
          </div>
          <div className="stat-pill opacity-0 animate-scale-bounce" style={{ animationDelay: "350ms", animationFillMode: "forwards" }}>
            <TrendingUp className="h-3.5 w-3.5 text-success" />
            <span className="font-mono">৳{Math.round(stats?.mrr ?? 0).toLocaleString()}</span> MRR
          </div>
          <div className="stat-pill opacity-0 animate-scale-bounce" style={{ animationDelay: "500ms", animationFillMode: "forwards" }}>
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            <span className="font-mono">{stats?.overduePayments?.length ?? 0}</span> Overdue
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div>
        <p className="section-label mb-3">Key Metrics</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard title="MRR" value={`৳${Math.round(stats?.mrr ?? 0).toLocaleString()}`} subtitle={`ARR: ৳${Math.round((stats?.mrr ?? 0) * 12).toLocaleString()}`} icon={TrendingUp} staggerIndex={0} />
          <KpiCard title="Active Agencies" value={String(stats?.activeAgencies ?? 0)} subtitle={`${stats?.trialAgencies ?? 0} trial · ${stats?.suspendedAgencies ?? 0} suspended`} icon={Building2} accentColor="hsl(var(--success))" staggerIndex={1} />
          <KpiCard title="Total Clients" value={String(stats?.totalClients ?? 0)} subtitle="Across all agencies" icon={Users} accentColor="hsl(var(--accent-foreground))" staggerIndex={2} />
          <KpiCard title="ARPA" value={`৳${Math.round(stats?.arpa ?? 0).toLocaleString()}`} subtitle="Avg Revenue / Agency" icon={DollarSign} accentColor="hsl(var(--warning))" staggerIndex={3} />
          <KpiCard title="Total Revenue" value={`৳${Math.round(stats?.totalRevenue ?? 0).toLocaleString()}`} subtitle="All-time collected" icon={BarChart3} staggerIndex={4} />
          <KpiCard title="Overdue" value={String(stats?.overduePayments?.length ?? 0)} subtitle="Invoices overdue" icon={AlertTriangle} accentColor="hsl(var(--destructive))" staggerIndex={5} />
        </div>
      </div>

      {/* Charts Row */}
      <div>
        <p className="section-label mb-3">Distribution & Trends</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
            <Card className="border-0 bg-transparent shadow-none">
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
          </div>

          <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
            <Card className="border-0 bg-transparent shadow-none">
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
        </div>
      </div>

      {/* Bottom Row */}
      <div>
        <p className="section-label mb-3">Payments & Renewals</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "400ms", animationFillMode: "forwards" }}>
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader><CardTitle className="text-base">Upcoming Renewals (30 Days)</CardTitle></CardHeader>
              <CardContent>
                {(stats?.upcomingRenewals?.length ?? 0) > 0 ? (
                  <div className="space-y-2">
                    {stats!.upcomingRenewals.map((r: any, i: number) => (
                      <div key={i} className="flex justify-between items-center text-sm border-b border-border/40 pb-2 last:border-0">
                        <span className="text-foreground font-medium">{r.org_name}</span>
                        <span className="text-muted-foreground font-mono">৳{r.amount_bdt?.toLocaleString()}</span>
                        <Badge variant="outline">{r.current_period_end}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No renewals in next 30 days</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "500ms", animationFillMode: "forwards" }}>
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader><CardTitle className="text-base text-destructive">Overdue Payments</CardTitle></CardHeader>
              <CardContent>
                {(stats?.overduePayments?.length ?? 0) > 0 ? (
                  <div className="space-y-2">
                    {stats!.overduePayments.map((inv: any, i: number) => (
                      <div key={i} className="flex justify-between items-center text-sm border-b border-border/40 pb-2 last:border-0">
                        <span className="text-foreground">{inv.invoice_number || inv.org_id?.slice(0, 8)}</span>
                        <span className="text-destructive font-medium font-mono">৳{inv.amount_bdt?.toLocaleString()}</span>
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
      </div>
    </div>
  );
}
