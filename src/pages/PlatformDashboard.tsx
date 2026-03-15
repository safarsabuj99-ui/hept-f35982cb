import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, TrendingUp, Users, AlertTriangle } from "lucide-react";
import { Loader2 } from "lucide-react";

interface Stats {
  totalAgencies: number;
  activeAgencies: number;
  trialAgencies: number;
  mrr: number;
}

export default function PlatformDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const { data: orgs } = await supabase.from("organizations").select("id, status, plan");
      const { data: subs } = await supabase.from("organization_subscriptions").select("amount_bdt, payment_status, billing_cycle");

      const totalAgencies = orgs?.length ?? 0;
      const activeAgencies = orgs?.filter((o) => o.status === "active").length ?? 0;
      const trialAgencies = orgs?.filter((o) => o.status === "trial").length ?? 0;
      const mrr = subs?.filter((s) => s.payment_status === "paid").reduce((sum, s) => sum + (s.billing_cycle === "yearly" ? s.amount_bdt / 12 : s.amount_bdt), 0) ?? 0;

      setStats({ totalAgencies, activeAgencies, trialAgencies, mrr });
      setLoading(false);
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const kpis = [
    { label: "Total Agencies", value: stats?.totalAgencies ?? 0, icon: Building2, color: "text-primary" },
    { label: "Active", value: stats?.activeAgencies ?? 0, icon: Users, color: "text-success" },
    { label: "Trial", value: stats?.trialAgencies ?? 0, icon: AlertTriangle, color: "text-warning" },
    { label: "MRR (BDT)", value: `৳${(stats?.mrr ?? 0).toLocaleString()}`, icon: TrendingUp, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of all agencies on the platform</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
