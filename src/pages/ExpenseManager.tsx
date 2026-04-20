import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { DateRangeFilter, DateRange, DatePreset, toISODate, getLocalToday, getDhakaDateString } from "@/components/DateRangeFilter";
import { TablePagination } from "@/components/TablePagination";
import { adjustAccountBalance } from "@/lib/adjustAccountBalance";

const CATEGORIES = ["Rent", "Salary", "Software", "Owner_Draw", "Marketing", "Other"] as const;
const CATEGORY_COLORS: Record<string, string> = {
  Rent: "hsl(var(--chart-meta))",
  Salary: "hsl(var(--primary))",
  Software: "hsl(var(--chart-google))",
  Owner_Draw: "hsl(var(--warning))",
  Marketing: "hsl(var(--chart-tiktok))",
  Other: "hsl(var(--muted-foreground))",
};

interface Expense {
  id: string;
  date: string;
  amount_bdt: number;
  category: string;
  description: string | null;
  created_at: string;
}

export default function ExpenseManager() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("Salary");
  const [description, setDescription] = useState("");
  const [expDate, setExpDate] = useState(getDhakaDateString());
  const [dateRange, setDateRange] = useState<DateRange | null>(() => { const t = getLocalToday(); return { from: t, to: t }; });
  const [periodLabel, setPeriodLabel] = useState("Today");
  const [agencyAccounts, setAgencyAccounts] = useState<any[]>([]);
  const [paidFromAccountId, setPaidFromAccountId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "opex" | "owner_draw">("all");
  const { user } = useAuth();
  const { profile } = useProfile();
  const { toast } = useToast();

  const fetchExpenses = useCallback(async (range: DateRange | null) => {
    setLoading(true);
    let query = supabase.from("agency_expenses").select("*").order("date", { ascending: false });
    if (range) {
      query = query.gte("date", toISODate(range.from)).lte("date", toISODate(range.to));
    }
    const { data } = await query;
    setExpenses((data as any[]) ?? []);
    setLoading(false);
  }, []);

  const fetchAgencyAccounts = useCallback(async () => {
    const { data } = await supabase.from("agency_accounts" as any).select("id, name, type, current_balance_bdt").eq("is_active", true).order("name");
    setAgencyAccounts(data ?? []);
  }, []);

  useEffect(() => {
    fetchExpenses(dateRange);
    fetchAgencyAccounts();
  }, []);

  const handleRangeChange = (range: DateRange | null, preset: DatePreset) => {
    setDateRange(range);
    const labels: Record<DatePreset, string> = {
      all_time: "All Time", today: "Today", yesterday: "Yesterday", this_week: "This Week",
      last_week: "Last Week", this_month: "This Month", last_month: "Last Month", custom: "Custom Range",
    };
    setPeriodLabel(labels[preset]);
    fetchExpenses(range);
    setCurrentPage(1);
  };

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) {
      toast({ title: "Error", description: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("agency_expenses").insert({
      date: expDate,
      amount_bdt: Number(amount),
      category,
      description: description || null,
      created_by: user?.id,
      paid_from_account_id: paidFromAccountId || null,
      org_id: profile?.org_id || null,
    } as any);

    if (!error && paidFromAccountId) {
      await adjustAccountBalance(paidFromAccountId, -Number(amount));
    }
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Expense recorded" });
      setAmount(""); setDescription(""); setPaidFromAccountId("");
      setDialogOpen(false);
      fetchExpenses(dateRange);
      fetchAgencyAccounts();
    }
  };

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount_bdt), 0);
  const opex = expenses.filter(e => e.category !== "Owner_Draw").reduce((s, e) => s + Number(e.amount_bdt), 0);
  const ownerDraw = expenses.filter(e => e.category === "Owner_Draw").reduce((s, e) => s + Number(e.amount_bdt), 0);

  // Apply category filter to displayed list + pie chart (KPI totals stay full)
  const filteredExpenses = expenses.filter(e => {
    if (categoryFilter === "all") return true;
    if (categoryFilter === "opex") return e.category !== "Owner_Draw";
    if (categoryFilter === "owner_draw") return e.category === "Owner_Draw";
    return true;
  });

  const categoryTotals: Record<string, number> = {};
  for (const e of filteredExpenses) {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + Number(e.amount_bdt);
  }
  const pieData = Object.entries(categoryTotals).map(([name, value]) => ({ name, value }));

  const toggleFilter = (next: "all" | "opex" | "owner_draw") => {
    setCategoryFilter(prev => (prev === next ? "all" : next));
    setCurrentPage(1);
  };

  const filterLabel = categoryFilter === "opex" ? " — OpEx" : categoryFilter === "owner_draw" ? " — Owner's Draw" : "";

  return (
    <div className="space-y-6">
      <div className="flex justify-end animate-slide-up-fade">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" /> Add Expense</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={expDate} onChange={e => setExpDate(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount (BDT)</Label>
                  <Input type="number" placeholder="e.g. 5000" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {agencyAccounts.length > 0 && (
                <div>
                  <Label>Paid From Account</Label>
                  <Select value={paidFromAccountId} onValueChange={setPaidFromAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account (optional)" /></SelectTrigger>
                    <SelectContent>
                      {agencyAccounts.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.name} ({a.type}) — ৳{Number(a.current_balance_bdt).toLocaleString()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Description (optional)</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Details..." />
              </div>
              <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Expense
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <DateRangeFilter onRangeChange={handleRangeChange} />

      {/* Summary Cards — clickable filters */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 opacity-0 animate-slide-up-fade stagger-2">
        <button
          type="button"
          onClick={() => toggleFilter("all")}
          className={cn(
            "glass-card glow-border text-left transition-all hover:scale-[1.01] focus:outline-none",
            categoryFilter === "all" && "ring-2 ring-primary"
          )}
        >
          <CardContent className="pt-6 text-center">
            <p className="text-xs text-muted-foreground">Total Expenses ({periodLabel})</p>
            {loading ? <Skeleton className="h-8 w-32 mx-auto" /> : (
              <p className="text-xl sm:text-2xl font-bold font-mono">৳{totalExpenses.toLocaleString()}</p>
            )}
          </CardContent>
        </button>
        <button
          type="button"
          onClick={() => toggleFilter("opex")}
          className={cn(
            "glass-card glow-border text-left transition-all hover:scale-[1.01] focus:outline-none",
            categoryFilter === "opex" && "ring-2 ring-primary"
          )}
        >
          <CardContent className="pt-6 text-center">
            <p className="text-xs text-muted-foreground">OpEx ({periodLabel})</p>
            {loading ? <Skeleton className="h-8 w-32 mx-auto" /> : (
              <p className="text-xl sm:text-2xl font-bold font-mono">৳{opex.toLocaleString()}</p>
            )}
          </CardContent>
        </button>
        <button
          type="button"
          onClick={() => toggleFilter("owner_draw")}
          className={cn(
            "glass-card glow-border text-left transition-all hover:scale-[1.01] focus:outline-none",
            categoryFilter === "owner_draw" && "ring-2 ring-primary"
          )}
        >
          <CardContent className="pt-6 text-center">
            <p className="text-xs text-muted-foreground">Owner's Draw ({periodLabel})</p>
            {loading ? <Skeleton className="h-8 w-32 mx-auto" /> : (
              <p className="text-xl sm:text-2xl font-bold font-mono text-warning">৳{ownerDraw.toLocaleString()}</p>
            )}
          </CardContent>
        </button>
      </div>

      {/* Pie Chart + Expenses */}
      <div className="grid gap-4 md:grid-cols-2 opacity-0 animate-slide-up-fade stagger-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Distribution</CardTitle></CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={window.innerWidth < 640 ? 200 : 280}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={window.innerWidth < 640 ? 70 : 100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || "hsl(var(--muted))"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `৳${v.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Expenses ({periodLabel}){filterLabel}</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredExpenses.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No expenses in this period</p>
            ) : (
              <>
                {/* Mobile card view */}
                <div className="flex flex-col gap-3 md:hidden max-h-[400px] overflow-y-auto">
                  {filteredExpenses.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(e => (
                    <div key={e.id} className="rounded-xl border p-3 space-y-1 bg-card">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={e.category === "Owner_Draw" ? "outline" : "secondary"} className="text-xs">
                          {e.category.replace("_", " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">{e.date}</span>
                      </div>
                      <p className="font-mono font-semibold">৳{Number(e.amount_bdt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpenses.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(e => (
                        <TableRow key={e.id}>
                          <TableCell className="font-mono text-sm">{e.date}</TableCell>
                          <TableCell>
                            <Badge variant={e.category === "Owner_Draw" ? "outline" : "secondary"}>
                              {e.category.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">৳{Number(e.amount_bdt).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  totalItems={filteredExpenses.length}
                  pageSize={pageSize}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}