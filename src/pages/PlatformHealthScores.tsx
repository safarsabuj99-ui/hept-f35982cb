import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { HeartPulse, RefreshCw, Loader2, Users, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { differenceInDays, parseISO } from "date-fns";

interface OrgHealth { org_id: string; name: string; score: number; activity: number; payment: number; usage: number; }

export default function PlatformHealthScores() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [computing, setComputing] = useState(false);

  const { data: orgs = [] } = useQuery({ queryKey: ["health-orgs"], queryFn: async () => { const { data } = await supabase.from("organizations").select("id, name, status, max_clients, max_ad_accounts, max_managers"); return data || []; } });
  const { data: auditLogs = [] } = useQuery({ queryKey: ["health-audit"], queryFn: async () => { const { data } = await supabase.from("audit_logs").select("org_id, created_at").order("created_at", { ascending: false }).limit(1000); return data || []; } });
  const { data: invoices = [] } = useQuery({ queryKey: ["health-invoices"], queryFn: async () => { const { data } = await supabase.from("platform_invoices").select("org_id, status, due_date, payment_date"); return data || []; } });
  const { data: profiles = [] } = useQuery({ queryKey: ["health-profiles"], queryFn: async () => { const { data } = await supabase.from("profiles").select("org_id"); return data || []; } });
  const { data: adAccounts = [] } = useQuery({ queryKey: ["health-accounts"], queryFn: async () => { const { data } = await supabase.from("ad_accounts").select("org_id"); return data || []; } });

  const computedScores: OrgHealth[] = useMemo(() => {
    const now = new Date();
    return orgs.map((org) => {
      const orgLogs = auditLogs.filter((l) => l.org_id === org.id);
      const lastLog = orgLogs[0];
      const daysSinceActivity = lastLog ? differenceInDays(now, parseISO(lastLog.created_at)) : 90;
      const activityScore = Math.max(0, Math.min(100, 100 - daysSinceActivity * 2));
      const orgInvoices = invoices.filter((i) => i.org_id === org.id);
      const paidOnTime = orgInvoices.filter((i) => i.status === "paid").length;
      const totalInv = orgInvoices.length;
      const paymentScore = totalInv > 0 ? Math.round((paidOnTime / totalInv) * 100) : 50;
      const clientCount = profiles.filter((p) => p.org_id === org.id).length;
      const accountCount = adAccounts.filter((a) => a.org_id === org.id).length;
      const clientUtil = org.max_clients > 0 ? (clientCount / org.max_clients) * 100 : 0;
      const accountUtil = org.max_ad_accounts > 0 ? (accountCount / org.max_ad_accounts) * 100 : 0;
      const usageScore = Math.min(100, Math.round((clientUtil + accountUtil) / 2));
      const score = Math.round(activityScore * 0.25 + paymentScore * 0.35 + usageScore * 0.4);
      return { org_id: org.id, name: org.name, score, activity: activityScore, payment: paymentScore, usage: usageScore };
    });
  }, [orgs, auditLogs, invoices, profiles, adAccounts]);

  const handleRecalculate = async () => {
    setComputing(true);
    try {
      for (const s of computedScores) {
        await supabase.from("tenant_health_scores").upsert({ org_id: s.org_id, score: s.score, activity_score: s.activity, payment_score: s.payment, usage_score: s.usage, computed_at: new Date().toISOString() }, { onConflict: "org_id" });
      }
      queryClient.invalidateQueries({ queryKey: ["health-stored"] });
      toast({ title: "Health scores recalculated", description: `Updated ${computedScores.length} agencies` });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); } finally { setComputing(false); }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return "bg-success/15 text-success border-success/20";
    if (score >= 40) return "bg-warning/15 text-warning border-warning/20";
    return "bg-destructive/15 text-destructive border-destructive/20";
  };

  const getBarColor = (val: number) => {
    if (val >= 70) return "bg-success";
    if (val >= 40) return "bg-warning";
    return "bg-destructive";
  };

  const avg = computedScores.length > 0 ? Math.round(computedScores.reduce((s, c) => s + c.score, 0) / computedScores.length) : 0;
  const healthy = computedScores.filter((c) => c.score >= 70).length;
  const atRisk = computedScores.filter((c) => c.score < 40).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Customer Health Scores"
        subtitle="Composite health scoring per agency"
        icon={<HeartPulse className="h-6 w-6 text-primary" />}
        actions={
          <Button onClick={handleRecalculate} disabled={computing} className="press-effect">
            {computing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Recalculate All
          </Button>
        }
      />

      <div>
        <p className="section-label mb-3">Score Summary</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KpiCard title="Average Score" value={String(avg)} icon={HeartPulse} staggerIndex={0} />
          <KpiCard title="Healthy (70+)" value={String(healthy)} icon={Users} accentColor="hsl(var(--success))" staggerIndex={1} />
          <KpiCard title="At Risk (<40)" value={String(atRisk)} icon={AlertTriangle} accentColor="hsl(var(--destructive))" staggerIndex={2} />
          <KpiCard title="Total Agencies" value={String(computedScores.length)} icon={Users} staggerIndex={3} />
        </div>
      </div>

      <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader><CardTitle>Health Breakdown</CardTitle></CardHeader>
          <CardContent>
            {computedScores.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No agencies found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency</TableHead><TableHead className="text-center">Overall</TableHead>
                    <TableHead className="text-center">Activity (25%)</TableHead><TableHead className="text-center">Payment (35%)</TableHead>
                    <TableHead className="text-center">Usage (40%)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {computedScores.sort((a, b) => a.score - b.score).map((s) => (
                    <TableRow key={s.org_id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-center"><Badge className={`rounded-md ${getScoreColor(s.score)}`}>{s.score}</Badge></TableCell>
                      {[s.activity, s.payment, s.usage].map((val, i) => (
                        <TableCell key={i} className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-12 h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${getBarColor(val)}`} style={{ width: `${val}%` }} /></div>
                            <span className="text-xs font-mono">{val}</span>
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
