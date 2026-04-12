import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { DollarSign, TrendingDown, TrendingUp, Percent } from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";

export default function PlatformFinanceOverview() {
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const [{ data: subData }, { data: expData }, { data: invData }] = await Promise.all([
        supabase.from("organization_subscriptions").select("*"),
        supabase.from("platform_expenses" as any).select("*"),
        supabase.from("platform_invoices").select("*"),
      ]);
      setSubs(subData ?? []);
      setExpenses(((expData as any[]) ?? []));
      setInvoices(invData ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const metrics = useMemo(() => {
    const activeSubs = subs.filter((s: any) => s.payment_status === "paid" || s.payment_status === "pending");
    const totalRevenue = activeSubs.reduce((sum: number, s: any) => sum + Number(s.amount_bdt || 0), 0);
    const totalExpenses = expenses.reduce((sum: number, e: any) => sum + Number(e.amount_bdt || 0), 0);
    const netProfit = totalRevenue - totalExpenses;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Monthly P&L for last 12 months
    const months: { month: string; revenue: number; expenses: number; profit: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM yy");
      const mStart = startOfMonth(d);
      const mEnd = startOfMonth(subMonths(d, -1));

      const rev = activeSubs
        .filter((s: any) => {
          const start = new Date(s.current_period_start);
          return start >= mStart && start < mEnd;
        })
        .reduce((sum: number, s: any) => sum + Number(s.amount_bdt || 0), 0);

      const exp = expenses
        .filter((e: any) => {
          const ed = new Date(e.date);
          return ed >= mStart && ed < mEnd;
        })
        .reduce((sum: number, e: any) => sum + Number(e.amount_bdt || 0), 0);

      months.push({ month: label, revenue: Math.round(rev), expenses: Math.round(exp), profit: Math.round(rev - exp) });
    }

    // Revenue by plan
    const planRev: Record<string, number> = {};
    activeSubs.forEach((s: any) => {
      planRev[s.plan] = (planRev[s.plan] || 0) + Number(s.amount_bdt || 0);
    });
    const planBreakdown = Object.entries(planRev).map(([plan, amount]) => ({ plan, amount: Math.round(amount) }));

    return { totalRevenue, totalExpenses, netProfit, margin, months, planBreakdown };
  }, [subs, expenses]);

  if (loading) {
    return (
      <div className="space-y-6 mt-4">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 mt-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Revenue" value={`৳${Math.round(metrics.totalRevenue).toLocaleString()}`} icon={DollarSign} staggerIndex={0} />
        <KpiCard title="Total Expenses" value={`৳${Math.round(metrics.totalExpenses).toLocaleString()}`} icon={TrendingDown} accentColor="hsl(var(--destructive))" staggerIndex={1} />
        <KpiCard title="Net Profit" value={`৳${Math.round(metrics.netProfit).toLocaleString()}`} icon={TrendingUp} accentColor={metrics.netProfit >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} staggerIndex={2} />
        <KpiCard title="Profit Margin" value={`${metrics.margin.toFixed(1)}%`} icon={Percent} staggerIndex={3} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader><CardTitle className="text-sm">Monthly P&L (Last 12 Months)</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={{ revenue: { label: "Revenue", color: "hsl(var(--primary))" }, expenses: { label: "Expenses", color: "hsl(var(--destructive))" }, profit: { label: "Profit", color: "hsl(142, 76%, 36%)" } }} className="h-[280px]">
                <BarChart data={metrics.months}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader><CardTitle className="text-sm">Revenue by Plan</CardTitle></CardHeader>
            <CardContent>
              {metrics.planBreakdown.length > 0 ? (
                <ChartContainer config={{ amount: { label: "Revenue", color: "hsl(var(--primary))" } }} className="h-[280px]">
                  <BarChart data={metrics.planBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="plan" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">No subscription data</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "400ms", animationFillMode: "forwards" }}>
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader><CardTitle className="text-sm">P&L Statement</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Net Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">{m.month}</TableCell>
                    <TableCell className="text-right font-mono text-primary">৳{m.revenue.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-destructive">৳{m.expenses.toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${m.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                      ৳{m.profit.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
