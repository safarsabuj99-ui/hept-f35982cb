import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { format, differenceInMonths, startOfMonth, parseISO } from "date-fns";
import { useMemo } from "react";

interface Org {
  id: string;
  name: string;
  created_at: string;
  status: string;
}

interface Subscription {
  org_id: string;
  amount_bdt: number;
  billing_cycle: string;
}

export default function PlatformCohorts() {
  const { data: orgs = [] } = useQuery({
    queryKey: ["platform-cohort-orgs"],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id, name, created_at, status");
      return (data || []) as Org[];
    },
  });

  const { data: subs = [] } = useQuery({
    queryKey: ["platform-cohort-subs"],
    queryFn: async () => {
      const { data } = await supabase.from("organization_subscriptions").select("org_id, amount_bdt, billing_cycle");
      return (data || []) as Subscription[];
    },
  });

  const cohortData = useMemo(() => {
    if (!orgs.length) return [];

    const now = new Date();
    const cohortMap = new Map<string, { total: number; active: number; revenue: number; months: number }>();

    orgs.forEach((org) => {
      const cohortKey = format(startOfMonth(parseISO(org.created_at)), "yyyy-MM");
      const monthsAge = differenceInMonths(now, parseISO(org.created_at));
      const existing = cohortMap.get(cohortKey) || { total: 0, active: 0, revenue: 0, months: monthsAge };

      existing.total += 1;
      if (org.status === "active" || org.status === "trial") existing.active += 1;

      const sub = subs.find((s) => s.org_id === org.id);
      if (sub) {
        const monthly = sub.billing_cycle === "yearly" ? sub.amount_bdt / 12 : sub.amount_bdt;
        existing.revenue += monthly;
      }

      cohortMap.set(cohortKey, existing);
    });

    return Array.from(cohortMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        ...data,
        retention: data.total > 0 ? Math.round((data.active / data.total) * 100) : 0,
      }));
  }, [orgs, subs]);

  const getRetentionColor = (pct: number) => {
    if (pct >= 80) return "bg-emerald-500/20 text-emerald-400";
    if (pct >= 60) return "bg-yellow-500/20 text-yellow-400";
    if (pct >= 40) return "bg-orange-500/20 text-orange-400";
    return "bg-red-500/20 text-red-400";
  };

  const totalOrgs = orgs.length;
  const activeOrgs = orgs.filter((o) => o.status === "active" || o.status === "trial").length;
  const avgRetention = totalOrgs > 0 ? Math.round((activeOrgs / totalOrgs) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cohort Analysis</h1>
        <p className="text-muted-foreground">Track agency retention and revenue by signup month</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Cohorts</p>
                <p className="text-2xl font-bold">{cohortData.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Overall Retention</p>
              <p className="text-2xl font-bold">{avgRetention}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Total Agencies</p>
              <p className="text-2xl font-bold">{totalOrgs}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Retention Heatmap by Signup Month</CardTitle>
        </CardHeader>
        <CardContent>
          {cohortData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No cohort data available yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cohort Month</TableHead>
                  <TableHead className="text-right">Signed Up</TableHead>
                  <TableHead className="text-right">Still Active</TableHead>
                  <TableHead className="text-right">Retention</TableHead>
                  <TableHead className="text-right">MRR (৳)</TableHead>
                  <TableHead className="text-right">Age (months)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohortData.map((c) => (
                  <TableRow key={c.month}>
                    <TableCell className="font-medium">{format(parseISO(c.month + "-01"), "MMM yyyy")}</TableCell>
                    <TableCell className="text-right">{c.total}</TableCell>
                    <TableCell className="text-right">{c.active}</TableCell>
                    <TableCell className="text-right">
                      <Badge className={getRetentionColor(c.retention)}>{c.retention}%</Badge>
                    </TableCell>
                    <TableCell className="text-right">৳{c.revenue.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{c.months}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
