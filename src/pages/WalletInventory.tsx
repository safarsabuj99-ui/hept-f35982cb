import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Package, Wallet, Plus, Loader2, AlertTriangle, Clock, Flame } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFilter, DateRange, DatePreset, toISODate, getLocalToday, getDhakaDateString } from "@/components/DateRangeFilter";
import { TablePagination } from "@/components/TablePagination";

interface UsdOverview {
  totalPurchased: number;
  totalSpent: number;
  availableBalance: number;
  dailyBurn: number;
  runwayDays: number;
  clientObligations: number;
  usdNeeded: number;
  loading: boolean;
}

interface UsdPurchase {
  id: string;
  date: string;
  bdt_amount_paid: number;
  usd_received: number;
  calculated_rate: number;
  notes: string | null;
  created_at: string;
}

export default function WalletInventory() {
  const [purchases, setPurchases] = useState<UsdPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bdtPaid, setBdtPaid] = useState("");
  const [usdReceived, setUsdReceived] = useState("");
  const [chargePercent, setChargePercent] = useState("");
  const [notes, setNotes] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(getDhakaDateString());
  const [dateRange, setDateRange] = useState<DateRange | null>(() => { const t = getLocalToday(); return { from: t, to: t }; });
  const [periodLabel, setPeriodLabel] = useState("Today");
  const [agencyAccounts, setAgencyAccounts] = useState<any[]>([]);
  const [paidFromAccountId, setPaidFromAccountId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [overview, setOverview] = useState<UsdOverview>({
    totalPurchased: 0, totalSpent: 0, availableBalance: 0,
    dailyBurn: 0, runwayDays: 0, clientObligations: 0, usdNeeded: 0, loading: true,
  });
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchPurchases = useCallback(async (range: DateRange | null) => {
    setLoading(true);
    let query = supabase.from("usd_purchases").select("*").order("date", { ascending: false });
    if (range) {
      query = query.gte("date", toISODate(range.from)).lte("date", toISODate(range.to));
    }
    const { data } = await query;
    setPurchases((data as any[]) ?? []);
    setLoading(false);
  }, []);

  const fetchOverview = useCallback(async () => {
    setOverview(prev => ({ ...prev, loading: true }));

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    const [purchasesRes, spendRes, burn7Res, txnRes] = await Promise.all([
      // All-time total USD purchased
      supabase.from("usd_purchases").select("usd_received"),
      // All-time total spend from daily_metrics
      supabase.from("daily_metrics").select("spend"),
      // Last 7 days spend for burn rate
      supabase.from("daily_metrics").select("spend").gte("data_date", sevenDaysAgoStr),
      // All completed transactions for client obligations
      supabase.from("transactions").select("type, amount, client_id").eq("status", "completed"),
    ]);

    const totalPurchased = (purchasesRes.data ?? []).reduce((s: number, r: any) => s + Number(r.usd_received), 0);
    const totalSpent = (spendRes.data ?? []).reduce((s: number, r: any) => s + Number(r.spend), 0);
    const last7Spend = (burn7Res.data ?? []).reduce((s: number, r: any) => s + Number(r.spend), 0);
    const dailyBurn = last7Spend / 7;
    const availableBalance = totalPurchased - totalSpent;
    const runwayDays = dailyBurn > 0 ? availableBalance / dailyBurn : availableBalance > 0 ? 999 : 0;

    // Client obligations: sum net positive balances per client
    const clientBalances: Record<string, number> = {};
    for (const t of (txnRes.data ?? []) as any[]) {
      const cid = t.client_id;
      if (!clientBalances[cid]) clientBalances[cid] = 0;
      clientBalances[cid] += t.type === "credit" ? Number(t.amount) : -Number(t.amount);
    }
    const clientObligations = Object.values(clientBalances).filter(b => b > 0).reduce((s, b) => s + b, 0);
    const usdNeeded = Math.max(0, clientObligations - availableBalance);

    setOverview({
      totalPurchased, totalSpent, availableBalance, dailyBurn,
      runwayDays: Math.max(0, Math.floor(runwayDays)),
      clientObligations, usdNeeded, loading: false,
    });
  }, []);

  useEffect(() => {
    fetchPurchases(dateRange);
    fetchOverview();
    supabase.from("agency_accounts" as any).select("id, name, type, current_balance_bdt").eq("is_active", true).order("name").then(({ data }) => setAgencyAccounts(data ?? []));
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("wallet-inventory-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "usd_purchases" }, () => fetchPurchases(dateRange))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchPurchases, dateRange]);

  const handleRangeChange = (range: DateRange | null, preset: DatePreset) => {
    setDateRange(range);
    const labels: Record<DatePreset, string> = {
      all_time: "All Time", today: "Today", yesterday: "Yesterday", this_week: "This Week",
      last_week: "Last Week", this_month: "This Month", last_month: "Last Month", custom: "Custom Range",
    };
    setPeriodLabel(labels[preset]);
    fetchPurchases(range);
    setCurrentPage(1);
  };

  const calculateWAC = () => {
    if (purchases.length === 0) return 0;
    let totalCostBDT = 0, totalUSD = 0;
    for (const p of purchases) {
      totalCostBDT += Number(p.bdt_amount_paid);
      totalUSD += Number(p.usd_received);
    }
    return totalUSD > 0 ? Math.round((totalCostBDT / totalUSD) * 100) / 100 : 0;
  };

  const totalUsdPurchased = purchases.reduce((s, p) => s + Number(p.usd_received), 0);
  const totalBdtSpent = purchases.reduce((s, p) => s + Number(p.bdt_amount_paid), 0);
  const wac = calculateWAC();

  const chargeNum = chargePercent ? Number(chargePercent) : 0;
  const effectiveUsd = usdReceived && Number(usdReceived) > 0
    ? Number(usdReceived) * (1 - chargeNum / 100)
    : 0;

  const handleSubmit = async () => {
    if (!bdtPaid || !usdReceived || Number(usdReceived) <= 0) {
      toast({ title: "Error", description: "Please fill in valid amounts", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const netUsd = chargeNum > 0 ? effectiveUsd : Number(usdReceived);
    const { error } = await supabase.from("usd_purchases").insert({
      date: purchaseDate,
      bdt_amount_paid: Number(bdtPaid),
      usd_received: netUsd,
      notes: notes || null,
      created_by: user?.id,
      paid_from_account_id: paidFromAccountId || null,
    } as any);
    
    if (!error && paidFromAccountId) {
      const acc = agencyAccounts.find(a => a.id === paidFromAccountId);
      if (acc) {
        await supabase.from("agency_accounts" as any)
          .update({ current_balance_bdt: Number(acc.current_balance_bdt) - Number(bdtPaid) } as any)
          .eq("id", paidFromAccountId);
      }
    }
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "USD purchase recorded" });
      setBdtPaid(""); setUsdReceived(""); setChargePercent(""); setNotes(""); setPaidFromAccountId("");
      setDialogOpen(false);
      fetchPurchases(dateRange);
    }
  };

  const previewRate = bdtPaid && effectiveUsd > 0
    ? (Number(bdtPaid) / effectiveUsd).toFixed(2)
    : "—";

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" /> Buy USD</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record USD Purchase</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>BDT Paid</Label>
                    <Input type="number" placeholder="e.g. 10000" value={bdtPaid} onChange={e => setBdtPaid(e.target.value)} />
                  </div>
                  <div>
                    <Label>USD Received</Label>
                    <Input type="number" placeholder="e.g. 77" value={usdReceived} onChange={e => setUsdReceived(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Platform Charge % <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input type="number" step="0.1" min="0" max="100" placeholder="e.g. 1.5" value={chargePercent} onChange={e => setChargePercent(e.target.value)} />
                  {chargeNum > 0 && effectiveUsd > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Net USD: <span className="font-mono font-medium text-foreground">${effectiveUsd.toFixed(2)}</span> after {chargeNum}% charge
                    </p>
                  )}
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-xs text-muted-foreground">Calculated Rate</p>
                  <p className="text-2xl font-bold font-mono">{previewRate} <span className="text-sm font-normal text-muted-foreground">BDT/USD</span></p>
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
                  <Label>Notes (optional)</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Source, reference..." />
                </div>
                <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Record Purchase
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <DateRangeFilter onRangeChange={handleRangeChange} />

      {/* USD Inventory Overview — all-time, independent of date filter */}
      <Card className={`border-2 ${
        overview.loading ? "border-border" :
        overview.availableBalance < 0 || overview.runwayDays < 3 ? "border-destructive/50 bg-destructive/5" :
        overview.runwayDays <= 7 ? "border-yellow-500/50 bg-yellow-500/5" :
        "border-emerald-500/50 bg-emerald-500/5"
      }`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            USD Inventory Overview
            <Badge variant="outline" className="ml-auto text-[10px] font-normal">All-Time</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
            {/* Available Balance */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Available USD</p>
              {overview.loading ? <Skeleton className="h-8 w-24" /> : (
                <p className={`text-xl sm:text-2xl font-bold font-mono ${
                  overview.availableBalance < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
                }`}>
                  ${overview.availableBalance.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              )}
            </div>

            {/* Total Purchased */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Purchased</p>
              {overview.loading ? <Skeleton className="h-8 w-24" /> : (
                <p className="text-xl sm:text-2xl font-bold font-mono">
                  ${overview.totalPurchased.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              )}
            </div>

            {/* Total Spent */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Spent</p>
              {overview.loading ? <Skeleton className="h-8 w-24" /> : (
                <p className="text-xl sm:text-2xl font-bold font-mono">
                  ${overview.totalSpent.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              )}
            </div>

            {/* Daily Burn Rate */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Flame className="h-3 w-3" /> Daily Burn</p>
              {overview.loading ? <Skeleton className="h-8 w-24" /> : (
                <p className="text-xl sm:text-2xl font-bold font-mono">
                  ${overview.dailyBurn.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  <span className="text-sm font-normal text-muted-foreground">/day</span>
                </p>
              )}
            </div>

            {/* Runway & USD Needed */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Runway</p>
              {overview.loading ? <Skeleton className="h-8 w-24" /> : (
                <div>
                  <p className={`text-xl sm:text-2xl font-bold font-mono ${
                    overview.runwayDays < 3 ? "text-destructive" :
                    overview.runwayDays <= 7 ? "text-yellow-600 dark:text-yellow-400" :
                    "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {overview.runwayDays >= 999 ? "∞" : `${overview.runwayDays}d`}
                  </p>
                  {overview.usdNeeded > 0 && (
                    <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="h-3 w-3" />
                      Need ${overview.usdNeeded.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="hidden sm:block rounded-lg bg-primary/10 p-2"><TrendingUp className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Avg. Cost ({periodLabel})</p>
                {loading ? <Skeleton className="h-7 w-24" /> : (
                  <p className="text-xl sm:text-2xl font-bold font-mono">{wac.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">BDT</span></p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="hidden sm:block rounded-lg bg-success/10 p-2"><DollarSign className="h-5 w-5 text-success" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">USD Purchased ({periodLabel})</p>
                {loading ? <Skeleton className="h-7 w-24" /> : (
                  <p className="text-xl sm:text-2xl font-bold font-mono">${totalUsdPurchased.toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="hidden sm:block rounded-lg bg-warning/10 p-2"><Wallet className="h-5 w-5 text-warning" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">BDT Invested ({periodLabel})</p>
                {loading ? <Skeleton className="h-7 w-24" /> : (
                  <p className="text-xl sm:text-2xl font-bold font-mono">৳{totalBdtSpent.toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="hidden sm:block rounded-lg bg-accent p-2"><Package className="h-5 w-5 text-accent-foreground" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Purchases ({periodLabel})</p>
                {loading ? <Skeleton className="h-7 w-16" /> : (
                  <p className="text-xl sm:text-2xl font-bold font-mono">{purchases.length}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Purchase History */}
      <Card>
        <CardHeader><CardTitle className="text-base">Purchase History</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : purchases.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No purchases in this period. Click "Buy USD" to get started.</p>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="flex flex-col gap-3 md:hidden">
                {purchases.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(p => (
                  <div key={p.id} className="rounded-xl border p-4 space-y-2 bg-card">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-muted-foreground">{p.date}</span>
                      <Badge variant="secondary" className="font-mono">{Number(p.calculated_rate).toFixed(2)}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">BDT Paid</p>
                        <p className="font-mono font-medium">৳{Number(p.bdt_amount_paid).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">USD Received</p>
                        <p className="font-mono font-medium">${Number(p.usd_received).toLocaleString()}</p>
                      </div>
                    </div>
                    {p.notes && <p className="text-xs text-muted-foreground truncate">{p.notes}</p>}
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">BDT Paid</TableHead>
                      <TableHead className="text-right">USD Received</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-sm">{p.date}</TableCell>
                        <TableCell className="text-right font-mono">৳{Number(p.bdt_amount_paid).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">${Number(p.usd_received).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="font-mono">{Number(p.calculated_rate).toFixed(2)}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{p.notes || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePagination
                totalItems={purchases.length}
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
  );
}