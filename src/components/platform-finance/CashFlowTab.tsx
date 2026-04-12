import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownLeft, ArrowUpRight, Wallet, Clock } from "lucide-react";
import { format, subMonths, startOfMonth, differenceInDays } from "date-fns";

export default function PlatformCashFlowTab() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const [{ data: invData }, { data: expData }, { data: subData }] = await Promise.all([
        supabase.from("platform_invoices").select("*"),
        supabase.from("platform_expenses" as any).select("*"),
        supabase.from("organization_subscriptions").select("*, organizations(name)"),
      ]);
      setInvoices(invData ?? []);
      setExpenses(((expData as any[]) ?? []));
      setSubs(subData ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const metrics = useMemo(() => {
    const paidInvoices = invoices.filter((i: any) => i.status === "paid");
    const totalCollected = paidInvoices.reduce((s: number, i: any) => s + Number(i.amount_bdt || 0), 0);
    const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.amount_bdt || 0), 0);
    const netCashFlow = totalCollected - totalExpenses;

    // Outstanding receivables with aging
    const unpaidInvoices = invoices.filter((i: any) => i.status !== "paid" && i.status !== "cancelled");
    const totalOutstanding = unpaidInvoices.reduce((s: number, i: any) => s + Number(i.amount_bdt || 0), 0);

    const aging = { "0-30": 0, "31-60": 0, "60+": 0 };
    unpaidInvoices.forEach((inv: any) => {
      const days = differenceInDays(new Date(), new Date(inv.created_at));
      if (days <= 30) aging["0-30"] += Number(inv.amount_bdt || 0);
      else if (days <= 60) aging["31-60"] += Number(inv.amount_bdt || 0);
      else aging["60+"] += Number(inv.amount_bdt || 0);
    });

    // Monthly cash flow
    const monthly: { month: string; inflow: number; outflow: number; net: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const mStart = startOfMonth(d);
      const mEnd = startOfMonth(subMonths(d, -1));

      const inflow = paidInvoices
        .filter((inv: any) => { const pd = new Date(inv.paid_at || inv.created_at); return pd >= mStart && pd < mEnd; })
        .reduce((s: number, inv: any) => s + Number(inv.amount_bdt || 0), 0);

      const outflow = expenses
        .filter((e: any) => { const ed = new Date(e.date); return ed >= mStart && ed < mEnd; })
        .reduce((s: number, e: any) => s + Number(e.amount_bdt || 0), 0);

      monthly.push({ month: format(d, "MMM yy"), inflow: Math.round(inflow), outflow: Math.round(outflow), net: Math.round(inflow - outflow) });
    }

    // Upcoming renewals (next 30 days)
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400000);
    const upcomingRenewals = subs.filter((s: any) => {
      const end = new Date(s.current_period_end);
      return s.auto_renew && end >= now && end <= in30;
    }).map((s: any) => ({
      org: (s as any).organizations?.name || "Unknown",
      plan: s.plan,
      amount: Number(s.amount_bdt || 0),
      date: s.current_period_end,
    }));

    return { totalCollected, totalExpenses, netCashFlow, totalOutstanding, aging, monthly, upcomingRenewals };
  }, [invoices, expenses, subs]);

  if (loading) {
    return (
      <div className="space-y-6 mt-4">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 mt-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Collected" value={`৳${Math.round(metrics.totalCollected).toLocaleString()}`} icon={ArrowDownLeft} accentColor="hsl(142, 76%, 36%)" staggerIndex={0} />
        <KpiCard title="Total Outflow" value={`৳${Math.round(metrics.totalExpenses).toLocaleString()}`} icon={ArrowUpRight} accentColor="hsl(var(--destructive))" staggerIndex={1} />
        <KpiCard title="Net Cash Flow" value={`৳${Math.round(metrics.netCashFlow).toLocaleString()}`} icon={Wallet} accentColor={metrics.netCashFlow >= 0 ? "hsl(142, 76%, 36%)" : "hsl(var(--destructive))"} staggerIndex={2} />
        <KpiCard title="Outstanding" value={`৳${Math.round(metrics.totalOutstanding).toLocaleString()}`} icon={Clock} accentColor="hsl(45, 93%, 47%)" staggerIndex={3} />
      </div>

      <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader><CardTitle className="text-sm">Monthly Cash Flow</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{ inflow: { label: "Inflow", color: "hsl(142, 76%, 36%)" }, outflow: { label: "Outflow", color: "hsl(var(--destructive))" } }} className="h-[260px]">
              <BarChart data={metrics.monthly}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="inflow" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outflow" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader><CardTitle className="text-sm">Receivable Aging</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(metrics.aging).map(([bucket, amount]) => (
                  <div key={bucket} className="flex items-center justify-between">
                    <Badge variant={bucket === "60+" ? "destructive" : "outline"}>{bucket} days</Badge>
                    <span className="font-mono font-medium">৳{Math.round(amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "400ms", animationFillMode: "forwards" }}>
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader><CardTitle className="text-sm">Upcoming Renewals (30 days)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Renewal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.upcomingRenewals.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.org}</TableCell>
                      <TableCell><Badge variant="outline">{r.plan}</Badge></TableCell>
                      <TableCell className="text-right font-mono">৳{Math.round(r.amount).toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(r.date), "dd MMM")}</TableCell>
                    </TableRow>
                  ))}
                  {metrics.upcomingRenewals.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No renewals in next 30 days</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
