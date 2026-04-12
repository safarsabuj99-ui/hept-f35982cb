import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { DollarSign, Link2, MousePointerClick, TrendingUp, Users, Loader2 } from "lucide-react";

export default function AffiliateDashboard() {
  const { user } = useAuth();
  const [affiliate, setAffiliate] = useState<any>(null);
  const [stats, setStats] = useState({ clicks: 0, conversions: 0, pending: 0, qualified: 0, totalEarnings: 0, pendingEarnings: 0, linkCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    const { data: aff } = await supabase.from("affiliates").select("*").eq("user_id", user!.id).single();
    if (!aff) { setLoading(false); return; }
    setAffiliate(aff);

    const { data: links } = await supabase.from("affiliate_links").select("clicks").eq("affiliate_id", aff.id);
    const totalClicks = links?.reduce((s, l) => s + (l.clicks || 0), 0) || 0;

    const { data: conversions } = await supabase.from("affiliate_conversions").select("status, commission_bdt").eq("affiliate_id", aff.id);
    const pending = conversions?.filter(c => c.status === "pending").length || 0;
    const qualified = conversions?.filter(c => c.status === "qualified").length || 0;
    const totalEarnings = conversions?.filter(c => ["qualified", "paid"].includes(c.status)).reduce((s, c) => s + Number(c.commission_bdt || 0), 0) || 0;
    const pendingEarnings = conversions?.filter(c => c.status === "qualified").reduce((s, c) => s + Number(c.commission_bdt || 0), 0) || 0;

    setStats({
      clicks: totalClicks,
      conversions: conversions?.length || 0,
      pending,
      qualified,
      totalEarnings,
      pendingEarnings,
      linkCount: links?.length || 0,
    });
    setLoading(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const statusColor = affiliate?.status === "active" ? "default" : affiliate?.status === "suspended" ? "destructive" : "secondary";

  const kpis = [
    { label: "Total Earnings", value: `৳${stats.totalEarnings.toLocaleString()}`, icon: DollarSign, color: "text-emerald-500" },
    { label: "Pending Payout", value: `৳${stats.pendingEarnings.toLocaleString()}`, icon: TrendingUp, color: "text-amber-500" },
    { label: "Total Clicks", value: stats.clicks.toLocaleString(), icon: MousePointerClick, color: "text-blue-500" },
    { label: "Conversions", value: stats.conversions.toString(), icon: Users, color: "text-purple-500" },
    { label: "Active Links", value: stats.linkCount.toString(), icon: Link2, color: "text-primary" },
    { label: "Conversion Rate", value: stats.clicks > 0 ? `${((stats.conversions / stats.clicks) * 100).toFixed(1)}%` : "0%", icon: TrendingUp, color: "text-rose-500" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${affiliate?.full_name || "Affiliate"}`} subtitle="Your affiliate performance overview" actions={<Badge variant={statusColor} className="capitalize">{affiliate?.status}</Badge>} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-xl font-bold">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Commission Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Commission Rate</span><span className="font-medium">{affiliate?.commission_rate}%</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Commission Type</span><span className="font-medium capitalize">{affiliate?.commission_type}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total Paid</span><span className="font-medium">৳{Number(affiliate?.total_paid_bdt || 0).toLocaleString()}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Quick Stats</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Pending Referrals</span><span className="font-medium">{stats.pending}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Qualified (Awaiting Payout)</span><span className="font-medium">{stats.qualified}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Member Since</span><span className="font-medium">{affiliate?.created_at ? new Date(affiliate.created_at).toLocaleDateString() : "—"}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
