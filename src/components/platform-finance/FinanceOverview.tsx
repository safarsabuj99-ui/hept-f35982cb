import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { DollarSign, TrendingDown, TrendingUp, Percent } from "lucide-react";
import { DateRangeFilter, DateRange, DatePreset, toISODate } from "@/components/DateRangeFilter";
import { format, subMonths, startOfMonth } from "date-fns";

export default function PlatformFinanceOverview() {
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [preset, setPreset] = useState<DatePreset>("today");

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

  const handleRangeChange = useCallback((range: DateRange | null, p: DatePreset) => {
    setDateRange(range);
    setPreset(p);
  }, []);

  const inRange = useCallback((dateStr: string) => {
    if (!dateRange) return true;
    const d = dateStr.slice(0, 10);
    return d >= toISODate(dateRange.from) && d <= toISODate(dateRange.to);
  }, [dateRange]);

  const metrics = useMemo(() => {
    const filteredSubs = subs.filter((s: any) =>
      (s.payment_status === "paid" || s.payment_status === "pending") &&
      inRange(s.current_period_start)
    );
    const filteredExpenses = expenses.filter((e: any) => inRange(e.date));

    const totalRevenue = filteredSubs.reduce((sum: number, s: any) => sum + Number(s.amount_bdt || 0), 0);
    const totalExpenses = filteredExpenses.reduce((sum: number, e: any) => sum + Number(e.amount_bdt || 0), 0);
    const netProfit = totalRevenue - totalExpenses;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Monthly P&L for last 12 months
    const months: { month: string; revenue: number; expenses: number; profit: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const label = format(d, "MMM yy");
      const mStart = startOfMonth(d);
      const mEnd = startOfMonth(subMonths(d, -1));

      const rev = subs
        .filter((s: any) => {
          const start = new Date(s.current_period_start);
          return (s.payment_status === "paid" || s.payment_status === "pending") && start >= mStart && start < mEnd;
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
    filteredSubs.forEach((s: any) => {
      planRev[s.plan] = (planRev[s.plan] || 0) + Number(s.amount_bdt || 0);
    });
    const planBreakdown = Object.entries(planRev).map(([plan, amount]) => ({ plan, amount: Math.round(amount) }));

    return { totalRevenue, totalExpenses, netProfit, margin, months, planBreakdown };
  }, [subs, expenses, inRange]);

  if (loading) {
    return (
      <div className="space-y-6 mt-4">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const periodLabel = preset === "all_time" ? "" : preset === "today" ? " (Today)" : preset === "this_month" ? " (This Month)" : "";

  return (
    <div className="space-y-6 mt-4">
      <DateRangeFilter onRangeChange={handleRangeChange} />

      {/* P&L Summary Card */}
      <div className="glass-card glow-border animate-slide-up-fade">
        <Card className="border-0 bg-transparent shadow-none">
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Revenue{periodLabel}</p>
                <p className="text-2xl font-bold text-primary mt-1">৳{Math.round(metrics.totalRevenue).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Expenses{periodLabel}</p>
                <p className="text-2xl font-bold text-destructive mt-1">৳{Math.round(metrics.totalExpenses).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Gross Profit{periodLabel}</p>
                <p className={`text-2xl font-bold mt-1 ${metrics.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                  ৳{Math.round(metrics.netProfit).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
