import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, subMonths, startOfMonth } from "date-fns";

const CATEGORIES = ["hosting", "marketing", "salary", "tools", "gateway_fees", "legal", "office", "other"] as const;
const COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(142,76%,36%)", "hsl(45,93%,47%)", "hsl(280,60%,50%)", "hsl(200,70%,50%)", "hsl(30,80%,50%)", "hsl(var(--muted-foreground))"];

interface Expense { id: string; category: string; amount_bdt: number; description: string | null; date: string; created_at: string; }

export default function PlatformExpensesTab() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ category: "other", amount_bdt: "", description: "", date: format(new Date(), "yyyy-MM-dd") });

  const fetchExpenses = async () => {
    const { data } = await supabase.from("platform_expenses" as any).select("*").order("date", { ascending: false });
    setExpenses(((data as any[]) ?? []) as Expense[]);
    setLoading(false);
  };

  useEffect(() => { fetchExpenses(); }, []);

  const handleAdd = async () => {
    if (!form.amount_bdt || Number(form.amount_bdt) <= 0) { toast.error("Enter a valid amount"); return; }
    const { error } = await supabase.from("platform_expenses" as any).insert({
      category: form.category,
      amount_bdt: Number(form.amount_bdt),
      description: form.description || null,
      date: form.date,
      created_by: user?.id,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Expense added");
    setForm({ category: "other", amount_bdt: "", description: "", date: format(new Date(), "yyyy-MM-dd") });
    setDialogOpen(false);
    fetchExpenses();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("platform_expenses" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Expense deleted");
    fetchExpenses();
  };

  const analytics = useMemo(() => {
    const total = expenses.reduce((s, e) => s + Number(e.amount_bdt), 0);

    // By category
    const catMap: Record<string, number> = {};
    expenses.forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount_bdt); });
    const byCategory = Object.entries(catMap).map(([name, value]) => ({ name, value: Math.round(value) }));

    // Monthly trend
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

    return { total, byCategory, monthly };
  }, [expenses]);

  return (
    <div className="space-y-6 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold">Total Expenses: <span className="text-destructive">৳{Math.round(analytics.total).toLocaleString()}</span></p>
        </div>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-sm">{format(new Date(e.date), "dd MMM yyyy")}</TableCell>
                    <TableCell><Badge variant="outline">{e.category.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{e.description || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-destructive font-medium">৳{Number(e.amount_bdt).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(e.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {expenses.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No expenses recorded yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
