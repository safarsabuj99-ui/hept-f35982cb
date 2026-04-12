import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { Plus, Trash2, Receipt, Briefcase, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { format, subMonths, startOfMonth } from "date-fns";
import { DateRangeFilter, DateRange, DatePreset, toISODate } from "@/components/DateRangeFilter";
import { TablePagination } from "@/components/TablePagination";
import { adjustPlatformAccountBalance } from "@/lib/adjustPlatformAccountBalance";
import { useIsMobile } from "@/hooks/use-mobile";

const CATEGORIES = ["hosting", "marketing", "salary", "tools", "gateway_fees", "legal", "office", "other"] as const;
const COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(142,76%,36%)", "hsl(45,93%,47%)", "hsl(280,60%,50%)", "hsl(200,70%,50%)", "hsl(30,80%,50%)", "hsl(var(--muted-foreground))"];

interface Expense {
  id: string; category: string; amount_bdt: number; description: string | null;
  date: string; created_at: string; paid_from_account_id: string | null;
}

interface PlatformAccount { id: string; name: string; type: string; current_balance_bdt: number; }

export default function PlatformExpensesTab() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [form, setForm] = useState({ category: "other", amount_bdt: "", description: "", date: format(new Date(), "yyyy-MM-dd"), paid_from_account_id: "" });

  const fetchData = async () => {
    const [{ data: expData }, { data: accData }] = await Promise.all([
      supabase.from("platform_expenses" as any).select("*").order("date", { ascending: false }),
      supabase.from("platform_accounts").select("*").eq("is_active", true).order("name"),
    ]);
    setExpenses(((expData as any[]) ?? []) as Expense[]);
    setAccounts((accData ?? []) as PlatformAccount[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleRangeChange = useCallback((range: DateRange | null, _p: DatePreset) => {
    setDateRange(range);
    setPage(1);
  }, []);

  const inRange = useCallback((dateStr: string) => {
    if (!dateRange) return true;
    const d = dateStr.slice(0, 10);
    return d >= toISODate(dateRange.from) && d <= toISODate(dateRange.to);
  }, [dateRange]);

  const filteredExpenses = useMemo(() => expenses.filter(e => inRange(e.date)), [expenses, inRange]);

  const paginatedExpenses = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredExpenses.slice(start, start + pageSize);
  }, [filteredExpenses, page, pageSize]);

  const handleAdd = async () => {
    if (!form.amount_bdt || Number(form.amount_bdt) <= 0) { toast.error("Enter a valid amount"); return; }
    const accountId = form.paid_from_account_id || null;

    const { error } = await supabase.from("platform_expenses" as any).insert({
      category: form.category,
      amount_bdt: Number(form.amount_bdt),
      description: form.description || null,
      date: form.date,
      created_by: user?.id,
      paid_from_account_id: accountId,
    } as any);
    if (error) { toast.error(error.message); return; }

    if (accountId) {
      await adjustPlatformAccountBalance(accountId, -Number(form.amount_bdt));
    }

    toast.success("Expense added");
    setForm({ category: "other", amount_bdt: "", description: "", date: format(new Date(), "yyyy-MM-dd"), paid_from_account_id: "" });
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (exp: Expense) => {
    if (exp.paid_from_account_id) {
      await adjustPlatformAccountBalance(exp.paid_from_account_id, Number(exp.amount_bdt));
    }
    const { error } = await supabase.from("platform_expenses" as any).delete().eq("id", exp.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Expense deleted & balance restored");
    fetchData();
  };

  const analytics = useMemo(() => {
    const total = filteredExpenses.reduce((s, e) => s + Number(e.amount_bdt), 0);
    const opex = filteredExpenses.filter(e => e.category !== "salary").reduce((s, e) => s + Number(e.amount_bdt), 0);
    const salaries = filteredExpenses.filter(e => e.category === "salary").reduce((s, e) => s + Number(e.amount_bdt), 0);

    const catMap: Record<string, number> = {};
    filteredExpenses.forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount_bdt); });
    const byCategory = Object.entries(catMap).map(([name, value]) => ({ name, value: Math.round(value) }));

    const monthly: { month: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const mStart = startOfMonth(d);
      const mEnd = startOfMonth(subMonths(d, -1));
      const amt = expenses
        .filter((e) => { const ed = new Date(e.date); return ed >= mStart && ed < mEnd; })
        .reduce((s, e) => s + Number(e.amount_bdt), 0);
      monthly.push({ month: format(d, "MMM yy"), amount: Math.round(amt) });
    }

    return { total, opex, salaries, byCategory, monthly };
  }, [filteredExpenses, expenses]);

  const accountName = (id: string | null) => {
    if (!id) return "—";
    return accounts.find(a => a.id === id)?.name || "Unknown";
  };

  if (loading) return <div className="space-y-4 mt-4"><div className="grid gap-3 grid-cols-3">{[1,2,3].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div></div>;

  return (
    <div className="space-y-6 mt-4">
      <DateRangeFilter onRangeChange={handleRangeChange} />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <KpiCard title="Total Expenses" value={`৳${Math.round(analytics.total).toLocaleString()}`} icon={Receipt} accentColor="hsl(var(--destructive))" staggerIndex={0} />
        <KpiCard title="Operating Costs" value={`৳${Math.round(analytics.opex).toLocaleString()}`} icon={Briefcase} staggerIndex={1} />
        <KpiCard title="Salaries" value={`৳${Math.round(analytics.salaries).toLocaleString()}`} icon={CreditCard} staggerIndex={2} />
      </div>

      <div className="flex items-center justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Expense</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount (BDT)</Label>
                <Input type="number" value={form.amount_bdt} onChange={(e) => setForm((f) => ({ ...f, amount_bdt: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              {accounts.length > 0 && (
                <div>
                  <Label>Paid From Account</Label>
                  <Select value={form.paid_from_account_id} onValueChange={(v) => setForm((f) => ({ ...f, paid_from_account_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select account (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No account</SelectItem>
                      {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} (৳{Number(a.current_balance_bdt).toLocaleString()})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional note" />
              </div>
              <Button onClick={handleAdd} className="w-full">Save Expense</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card glow-border">
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader><CardTitle className="text-sm">Monthly Trend</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={{ amount: { label: "Expenses", color: "hsl(var(--destructive))" } }} className="h-[220px]">
                <BarChart data={analytics.monthly}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="amount" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        <div className="glass-card glow-border">
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader><CardTitle className="text-sm">By Category</CardTitle></CardHeader>
            <CardContent>
              {analytics.byCategory.length > 0 ? (
                <ChartContainer config={{ value: { label: "Amount" } }} className="h-[220px]">
                  <PieChart>
                    <Pie data={analytics.byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(entry) => entry.name}>
                      {analytics.byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No expenses yet</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="glass-card glow-border">
        <Card className="border-0 bg-transparent shadow-none">
          <CardContent className="p-0">
            {isMobile ? (
              <div className="divide-y divide-border">
                {paginatedExpenses.map((e) => (
                  <div key={e.id} className="p-4 space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{e.category.replace(/_/g, " ")}</Badge>
                      <span className="font-mono text-destructive font-medium">৳{Number(e.amount_bdt).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{format(new Date(e.date), "dd MMM yyyy")}</p>
                    {e.description && <p className="text-sm text-muted-foreground">{e.description}</p>}
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Paid: {accountName(e.paid_from_account_id)}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(e)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
                {paginatedExpenses.length === 0 && <p className="text-center py-8 text-muted-foreground text-sm">No expenses</p>}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Paid From</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedExpenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-sm">{format(new Date(e.date), "dd MMM yyyy")}</TableCell>
                      <TableCell><Badge variant="outline">{e.category.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{e.description || "—"}</TableCell>
                      <TableCell className="text-sm">{accountName(e.paid_from_account_id)}</TableCell>
                      <TableCell className="text-right font-mono text-destructive font-medium">৳{Number(e.amount_bdt).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(e)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedExpenses.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No expenses recorded yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
            <div className="px-4 pb-4">
              <TablePagination totalItems={filteredExpenses.length} pageSize={pageSize} currentPage={page} onPageChange={setPage} onPageSizeChange={setPageSize} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
