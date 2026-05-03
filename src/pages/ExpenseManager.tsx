import { useEffect, useState, useCallback, useMemo } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus, Loader2, Download, Search, MoreVertical, Pencil, Trash2,
  ArrowUpRight, ArrowDownRight, TrendingUp, Wallet, Receipt, Calendar, Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid } from "recharts";
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
  paid_from_account_id?: string | null;
}

const fmt = (n: number) => `৳${Math.round(n).toLocaleString()}`;
const pctDelta = (curr: number, prev: number) => {
  if (!prev) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
};

function daysBetween(from: Date, to: Date) {
  const ms = to.setHours(0,0,0,0) - new Date(from).setHours(0,0,0,0);
  return Math.max(0, Math.round(ms / 86400000));
}

function buildPrevRange(range: DateRange): DateRange {
  const len = daysBetween(range.from, range.to) + 1;
  const prevTo = new Date(range.from); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (len - 1));
  return { from: prevFrom, to: prevTo };
}

export default function ExpenseManager() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [prevTotal, setPrevTotal] = useState(0);
  const [prevOpex, setPrevOpex] = useState(0);
  const [prevOwner, setPrevOwner] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("Salary");
  const [description, setDescription] = useState("");
  const [expDate, setExpDate] = useState(getDhakaDateString());
  const [paidFromAccountId, setPaidFromAccountId] = useState("");

  const [dateRange, setDateRange] = useState<DateRange | null>(() => { const t = getLocalToday(); return { from: t, to: t }; });
  const [periodLabel, setPeriodLabel] = useState("Today");
  const [agencyAccounts, setAgencyAccounts] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "opex" | "owner_draw">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const { user } = useAuth();
  const { profile } = useProfile();
  const { toast } = useToast();

  const accountById = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of agencyAccounts) map.set(a.id, a);
    return map;
  }, [agencyAccounts]);

  const fetchExpenses = useCallback(async (range: DateRange | null) => {
    setLoading(true);
    const baseSel = "id, date, amount_bdt, category, description, created_at, paid_from_account_id";

    let currQ = supabase.from("agency_expenses").select(baseSel).order("date", { ascending: false });
    if (range) currQ = currQ.gte("date", toISODate(range.from)).lte("date", toISODate(range.to));

    const prevQ = range
      ? supabase.from("agency_expenses")
          .select("amount_bdt, category")
          .gte("date", toISODate(buildPrevRange(range).from))
          .lte("date", toISODate(buildPrevRange(range).to))
      : null;

    const [currRes, prevRes] = await Promise.all([
      Promise.resolve(currQ),
      prevQ ? Promise.resolve(prevQ) : Promise.resolve(null as any),
    ]);
    setExpenses((currRes?.data as any[]) ?? []);

    if (prevRes?.data) {
      const rows = prevRes.data as any[];
      let total = 0, opex = 0, owner = 0;
      for (const r of rows) {
        const a = Number(r.amount_bdt) || 0;
        total += a;
        if (r.category === "Owner_Draw") owner += a; else opex += a;
      }
      setPrevTotal(total); setPrevOpex(opex); setPrevOwner(owner);
    } else {
      setPrevTotal(0); setPrevOpex(0); setPrevOwner(0);
    }

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

  const resetForm = () => {
    setAmount(""); setDescription(""); setPaidFromAccountId("");
    setCategory("Salary"); setExpDate(getDhakaDateString()); setEditingId(null);
  };

  const openEdit = (e: Expense) => {
    setEditingId(e.id);
    setAmount(String(e.amount_bdt));
    setCategory(e.category);
    setDescription(e.description || "");
    setExpDate(e.date);
    setPaidFromAccountId(e.paid_from_account_id || "");
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) {
      toast({ title: "Error", description: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    if (editingId) {
      // Update — refund old account, debit new
      const original = expenses.find(x => x.id === editingId);
      const { error } = await supabase.from("agency_expenses")
        .update({
          date: expDate,
          amount_bdt: Number(amount),
          category,
          description: description || null,
          paid_from_account_id: paidFromAccountId || null,
        } as any)
        .eq("id", editingId);

      if (!error && original) {
        if (original.paid_from_account_id) {
          await adjustAccountBalance(original.paid_from_account_id, Number(original.amount_bdt));
        }
        if (paidFromAccountId) {
          await adjustAccountBalance(paidFromAccountId, -Number(amount));
        }
      }

      setSubmitting(false);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Updated", description: "Expense updated successfully" });
        resetForm();
        setDialogOpen(false);
        fetchExpenses(dateRange);
        fetchAgencyAccounts();
      }
      return;
    }

    const { error } = await supabase.from("agency_expenses").insert({
      date: expDate,
      amount_bdt: Number(amount),
      category,
      description: description || null,
      created_by: user?.id,
      paid_from_account_id: paidFromAccountId || null,
      org_id: profile?.org_id || null,
    } as any);

    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Expense recorded" });
      resetForm();
      setDialogOpen(false);
      fetchExpenses(dateRange);
      fetchAgencyAccounts();
    }
  };

  const confirmDelete = async () => {
    if (!deletingExpense) return;
    const { error } = await supabase.from("agency_expenses").delete().eq("id", deletingExpense.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    if (deletingExpense.paid_from_account_id) {
      await adjustAccountBalance(deletingExpense.paid_from_account_id, Number(deletingExpense.amount_bdt));
    }
    toast({ title: "Deleted", description: "Expense removed" });
    setDeletingExpense(null);
    fetchExpenses(dateRange);
    fetchAgencyAccounts();
  };

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount_bdt), 0);
  const opex = expenses.filter(e => e.category !== "Owner_Draw").reduce((s, e) => s + Number(e.amount_bdt), 0);
  const ownerDraw = expenses.filter(e => e.category === "Owner_Draw").reduce((s, e) => s + Number(e.amount_bdt), 0);
  const dayCount = dateRange ? daysBetween(dateRange.from, dateRange.to) + 1 : Math.max(1, new Set(expenses.map(e => e.date)).size);
  const avgPerDay = dayCount > 0 ? totalExpenses / dayCount : 0;
  const largest = expenses.reduce((m, e) => Math.max(m, Number(e.amount_bdt)), 0);

  const dTotal = pctDelta(totalExpenses, prevTotal);
  const dOpex = pctDelta(opex, prevOpex);
  const dOwner = pctDelta(ownerDraw, prevOwner);

  // Apply filters
  const filteredExpenses = expenses.filter(e => {
    if (categoryFilter === "opex" && e.category === "Owner_Draw") return false;
    if (categoryFilter === "owner_draw" && e.category !== "Owner_Draw") return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const hay = `${e.category} ${e.description ?? ""} ${e.date}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Category breakdown (filtered)
  const categoryTotals: Record<string, number> = {};
  for (const e of filteredExpenses) {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + Number(e.amount_bdt);
  }
  const breakdownTotal = Object.values(categoryTotals).reduce((a, b) => a + b, 0) || 1;
  const breakdownRows = Object.entries(categoryTotals)
    .map(([name, value]) => ({ name, value, pct: (value / breakdownTotal) * 100 }))
    .sort((a, b) => b.value - a.value);

  // Daily trend
  const trendData = useMemo(() => {
    if (!dateRange) return [];
    const map = new Map<string, number>();
    const cur = new Date(dateRange.from);
    while (cur <= dateRange.to) {
      map.set(toISODate(cur), 0);
      cur.setDate(cur.getDate() + 1);
    }
    for (const e of filteredExpenses) {
      if (map.has(e.date)) map.set(e.date, (map.get(e.date) || 0) + Number(e.amount_bdt));
    }
    return Array.from(map.entries()).map(([date, value]) => ({
      date, value,
      label: new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    }));
  }, [filteredExpenses, dateRange]);

  const toggleFilter = (next: "all" | "opex" | "owner_draw") => {
    setCategoryFilter(prev => (prev === next ? "all" : next));
    setCurrentPage(1);
  };

  const exportCSV = () => {
    const rows = [["Date", "Category", "Amount (BDT)", "Description", "Paid From"]];
    for (const e of filteredExpenses) {
      const acct = e.paid_from_account_id ? (accountById.get(e.paid_from_account_id)?.name ?? "") : "";
      rows.push([
        e.date, e.category, String(e.amount_bdt),
        (e.description || "").replace(/"/g, '""'), acct,
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `expenses-${periodLabel.toLowerCase().replace(/\s+/g, "-")}-${toISODate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filterLabel = categoryFilter === "opex" ? " — OpEx" : categoryFilter === "owner_draw" ? " — Owner's Draw" : "";
  const showDelta = !!dateRange;

  const DeltaPill = ({ delta }: { delta: number }) => {
    if (!showDelta) return null;
    const positive = delta >= 0;
    const Icon = positive ? ArrowUpRight : ArrowDownRight;
    // For expenses, increase = bad (warning), decrease = good
    const tone = positive ? "text-warning" : "text-emerald-500 dark:text-emerald-400";
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium", tone)}>
        <Icon className="h-3 w-3" />
        {Math.abs(delta).toFixed(1)}%
        <span className="text-muted-foreground font-normal ml-1">vs prev</span>
      </span>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        {/* Action bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 animate-slide-up-fade">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>Showing <span className="font-medium text-foreground">{periodLabel}</span></span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">{expenses.length} expense{expenses.length === 1 ? "" : "s"}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!filteredExpenses.length}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="shadow-glow"><Plus className="mr-1.5 h-3.5 w-3.5" /> Add Expense</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingId ? "Edit Expense" : "Record Expense"}</DialogTitle></DialogHeader>
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
                </div>
                <DialogFooter>
                  <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingId ? "Save Changes" : "Save Expense"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <DateRangeFilter onRangeChange={handleRangeChange} />

        {/* KPI cards */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 opacity-0 animate-slide-up-fade stagger-2">
          {[
            { key: "all" as const, label: "Total Expenses", value: totalExpenses, delta: dTotal, icon: Receipt, accent: "from-primary/15 to-transparent", iconColor: "text-primary" },
            { key: "opex" as const, label: "Operating Expenses", value: opex, delta: dOpex, icon: Wallet, accent: "from-chart-meta/15 to-transparent", iconColor: "text-chart-meta" },
            { key: "owner_draw" as const, label: "Owner's Draw", value: ownerDraw, delta: dOwner, icon: TrendingUp, accent: "from-warning/15 to-transparent", iconColor: "text-warning" },
          ].map((kpi) => (
            <button
              key={kpi.key}
              type="button"
              onClick={() => toggleFilter(kpi.key)}
              className={cn(
                "glass-card glow-border relative overflow-hidden text-left transition-all hover:scale-[1.015] focus:outline-none p-4",
                categoryFilter === kpi.key && "ring-2 ring-primary"
              )}
            >
              <div className={cn("absolute inset-0 bg-gradient-to-br pointer-events-none", kpi.accent)} />
              <div className="relative space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{kpi.label}</p>
                  <kpi.icon className={cn("h-4 w-4", kpi.iconColor)} />
                </div>
                {loading ? (
                  <Skeleton className="h-7 w-24" />
                ) : (
                  <p className={cn("text-xl sm:text-2xl font-bold font-mono leading-tight", kpi.key === "owner_draw" && "text-warning")}>
                    {fmt(kpi.value)}
                  </p>
                )}
                <DeltaPill delta={kpi.delta} />
              </div>
            </button>
          ))}

          {/* Avg / day card — informational, not a filter */}
          <div className="glass-card glow-border relative overflow-hidden p-4">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent pointer-events-none" />
            <div className="relative space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Avg / Day</p>
                <Calendar className="h-4 w-4 text-emerald-500" />
              </div>
              {loading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <p className="text-xl sm:text-2xl font-bold font-mono leading-tight">{fmt(avgPerDay)}</p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Largest: <span className="font-mono text-foreground">{fmt(largest)}</span> · {expenses.length} entries
              </p>
            </div>
          </div>
        </div>

        {/* Trend + Breakdown */}
        <div className="grid gap-4 lg:grid-cols-3 opacity-0 animate-slide-up-fade stagger-3">
          <Card className="lg:col-span-2 glass-card glow-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Daily Spend Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[240px] w-full" />
              ) : trendData.length === 0 || trendData.every(d => d.value === 0) ? (
                <div className="h-[240px] flex flex-col items-center justify-center text-muted-foreground">
                  <Inbox className="h-10 w-10 mb-2 opacity-40" />
                  <p className="text-sm">No spend in this period</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={trendData} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <RTooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [fmt(v), "Spent"]}
                    />
                    <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#expGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card glow-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Category Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : breakdownRows.length === 0 ? (
                <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground">
                  <Inbox className="h-10 w-10 mb-2 opacity-40" />
                  <p className="text-sm">No data yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {breakdownRows.map((row) => (
                    <div key={row.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[row.name] || "hsl(var(--muted))" }} />
                          <span className="font-medium">{row.name.replace("_", " ")}</span>
                        </div>
                        <div className="font-mono text-muted-foreground">
                          {fmt(row.value)} <span className="opacity-60">· {row.pct.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${row.pct}%`, background: CATEGORY_COLORS[row.name] || "hsl(var(--muted))" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Expenses table */}
        <Card className="glass-card glow-border opacity-0 animate-slide-up-fade stagger-4">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-sm font-semibold">
                Expenses ({periodLabel}){filterLabel}
              </CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search description, category..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredExpenses.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                  <Receipt className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No expenses found</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  {searchTerm ? "Try adjusting your search or filter." : `Nothing recorded for ${periodLabel}.`}
                </p>
                {!searchTerm && (
                  <Button size="sm" onClick={() => setDialogOpen(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add your first expense
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="flex flex-col gap-2 md:hidden">
                  {filteredExpenses.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(e => {
                    const acct = e.paid_from_account_id ? accountById.get(e.paid_from_account_id) : null;
                    return (
                      <div key={e.id} className="rounded-xl border border-border/60 p-3 bg-card/50 backdrop-blur-sm space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant={e.category === "Owner_Draw" ? "outline" : "secondary"} className="text-[10px]">
                                {e.category.replace("_", " ")}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground font-mono">{e.date}</span>
                            </div>
                            {e.description && <p className="text-xs text-muted-foreground line-clamp-2">{e.description}</p>}
                            {acct && <p className="text-[10px] text-muted-foreground">via {acct.name}</p>}
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-semibold text-sm">{fmt(Number(e.amount_bdt))}</p>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0"><MoreVertical className="h-3.5 w-3.5" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(e)}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDeletingExpense(e)} className="text-destructive"><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs">Paid From</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                        <TableHead className="text-xs w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpenses.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(e => {
                        const acct = e.paid_from_account_id ? accountById.get(e.paid_from_account_id) : null;
                        return (
                          <TableRow key={e.id} className="group">
                            <TableCell className="font-mono text-xs">{e.date}</TableCell>
                            <TableCell>
                              <Badge variant={e.category === "Owner_Draw" ? "outline" : "secondary"} className="text-[10px]">
                                {e.category.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[260px]">
                              {e.description ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-xs text-muted-foreground truncate block">{e.description}</span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs"><p className="text-xs">{e.description}</p></TooltipContent>
                                </Tooltip>
                              ) : <span className="text-xs text-muted-foreground/50">—</span>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {acct ? acct.name : <span className="text-muted-foreground/50">—</span>}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">{fmt(Number(e.amount_bdt))}</TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEdit(e)}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setDeletingExpense(e)} className="text-destructive"><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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

        <AlertDialog open={!!deletingExpense} onOpenChange={(o) => !o && setDeletingExpense(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete expense?</AlertDialogTitle>
              <AlertDialogDescription>
                {deletingExpense && (
                  <>
                    This will permanently remove the {fmt(Number(deletingExpense.amount_bdt))} {deletingExpense.category.replace("_", " ")} expense from {deletingExpense.date}.
                    {deletingExpense.paid_from_account_id && " The amount will be refunded to the source account."}
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
