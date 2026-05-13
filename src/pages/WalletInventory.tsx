import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { debounce } from "@/lib/debounce";
import { adjustAccountBalance } from "@/lib/adjustAccountBalance";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Package, Wallet, Plus, Loader2, AlertTriangle, Clock, Flame, CalendarCheck, RotateCcw, MinusCircle, ChevronDown, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFilter, DateRange, DatePreset, toISODate, getLocalToday, getDhakaDateString } from "@/components/DateRangeFilter";
import { TablePagination } from "@/components/TablePagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ClientBalance {
  client_id: string;
  full_name: string;
  balance: number;
}

interface UsdOverview {
  carryForward: number;
  boughtSince: number;
  spentSince: number;
  manualSpend: number;
  availableBalance: number;
  dailyBurn: number;
  runwayDays: number;
  clientObligations: number;
  usdNeeded: number;
  snapshotDate: string | null;
  previousCloseDate: string | null;
  previousCloseBalance: number;
  loading: boolean;
  clientBalances: ClientBalance[];
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

interface ManualSpend {
  id: string;
  date: string;
  amount_usd: number;
  category: string;
  description: string | null;
  notes: string | null;
  created_at: string;
}

const SPEND_CATEGORIES = [
  "Subscription",
  "Tools/Software",
  "Hosting",
  "Domain",
  "Transfer",
  "Refund",
  "Other",
];

export default function WalletInventory() {
  const [purchases, setPurchases] = useState<UsdPurchase[]>([]);
  const [manualSpends, setManualSpends] = useState<ManualSpend[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualSpendLoading, setManualSpendLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [spendDialogOpen, setSpendDialogOpen] = useState(false);
  const [openingBalanceDialogOpen, setOpeningBalanceDialogOpen] = useState(false);
  const [closePeriodDialogOpen, setClosePeriodDialogOpen] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingNotes, setOpeningNotes] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
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
  const [spendCurrentPage, setSpendCurrentPage] = useState(1);
  const [spendPageSize, setSpendPageSize] = useState(20);

  // Spend USD form state
  const [spendDate, setSpendDate] = useState(getDhakaDateString());
  const [spendAmount, setSpendAmount] = useState("");
  const [spendCategory, setSpendCategory] = useState("Other");
  const [spendDescription, setSpendDescription] = useState("");
  const [spendNotes, setSpendNotes] = useState("");

  const [overview, setOverview] = useState<UsdOverview>({
    carryForward: 0, boughtSince: 0, spentSince: 0, manualSpend: 0, availableBalance: 0,
    dailyBurn: 0, runwayDays: 0, clientObligations: 0, usdNeeded: 0,
    snapshotDate: null, previousCloseDate: null, previousCloseBalance: 0,
    loading: true, clientBalances: [],
  });
  const { user } = useAuth();
  const { profile } = useProfile();
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

  const fetchManualSpends = useCallback(async (range: DateRange | null) => {
    setManualSpendLoading(true);
    let query = supabase.from("usd_manual_spends").select("*").order("date", { ascending: false });
    if (range) {
      query = query.gte("date", toISODate(range.from)).lte("date", toISODate(range.to));
    }
    const { data } = await query;
    setManualSpends((data as any[]) ?? []);
    setManualSpendLoading(false);
  }, []);

  const refreshSnapshot = useCallback(async () => {
    try {
      await supabase.functions.invoke("auto-snapshot-usd");
    } catch (e) {
      console.warn("Snapshot refresh failed:", e);
    }
  }, []);

  const fetchOverview = useCallback(async () => {
    if (!profile?.org_id) return;
    setOverview(prev => ({ ...prev, loading: true }));

    const { data: snapshots } = await supabase
      .from("usd_inventory_snapshots" as any)
      .select("*")
      .eq("org_id", profile.org_id)
      .order("snapshot_date", { ascending: false })
      .limit(1);

    const snap = (snapshots as any[])?.[0] ?? null;
    const metrics = (snap?.metrics as any) ?? {};

    setOverview({
      carryForward: snap?.baseline_balance_usd != null
        ? Number(snap.baseline_balance_usd)
        : (metrics.carry_forward ?? (snap ? Number(snap.balance_usd) : 0)),
      boughtSince: metrics.bought_since ?? 0,
      spentSince: metrics.spent_since ?? 0,
      manualSpend: metrics.manual_spend ?? 0,
      availableBalance: snap ? Number(snap.balance_usd) : 0,
      dailyBurn: metrics.daily_burn ?? 0,
      runwayDays: metrics.runway_days ?? 0,
      clientObligations: metrics.client_obligations ?? 0,
      usdNeeded: metrics.usd_needed ?? 0,
      snapshotDate: snap?.snapshot_date ?? null,
      loading: false,
      clientBalances: (metrics.client_balances as ClientBalance[]) ?? [],
    });
  }, [profile?.org_id]);

  const handleRefreshNow = useCallback(async () => {
    setOverview(prev => ({ ...prev, loading: true }));
    try {
      await refreshSnapshot();
      await fetchOverview();
      toast({ title: "Refreshed", description: "USD inventory updated." });
    } catch {
      toast({ title: "Error", description: "Failed to refresh", variant: "destructive" });
      setOverview(prev => ({ ...prev, loading: false }));
    }
  }, [fetchOverview, refreshSnapshot, toast]);

  const fetchAgencyAccounts = useCallback(async () => {
    const { data } = await supabase.from("agency_accounts" as any).select("id, name, type, current_balance_bdt").eq("is_active", true).order("name");
    setAgencyAccounts(data ?? []);
  }, []);

  useEffect(() => {
    fetchPurchases(dateRange);
    fetchManualSpends(dateRange);
    fetchAgencyAccounts();
  }, []);

  useEffect(() => {
    if (profile?.org_id) fetchOverview();
  }, [profile?.org_id, fetchOverview]);

  useEffect(() => {
    // Debounce all realtime callbacks — sync workers can write hundreds of
    // daily_metrics rows per second; without this the page would refetch and
    // visually "blink" continuously while a sync is running.
    const refreshPurchases = debounce(() => fetchPurchases(dateRange), 2000);
    const refreshOverview = debounce(() => fetchOverview(), 2000);
    const refreshManualSpends = debounce(() => { fetchManualSpends(dateRange); fetchOverview(); }, 2000);
    const refreshAgencyAccounts = debounce(() => fetchAgencyAccounts(), 2000);
    const refreshFromMetrics = debounce(() => { refreshSnapshot().then(() => fetchOverview()); }, 3000);

    const channel = supabase
      .channel("wallet-inventory-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "usd_purchases" }, refreshPurchases)
      .on("postgres_changes", { event: "*", schema: "public", table: "usd_inventory_snapshots" }, refreshOverview)
      .on("postgres_changes", { event: "*", schema: "public", table: "usd_manual_spends" }, refreshManualSpends)
      .on("postgres_changes", { event: "*", schema: "public", table: "agency_accounts" }, refreshAgencyAccounts)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_metrics" }, refreshFromMetrics)
      .subscribe();
    return () => {
      refreshPurchases.cancel();
      refreshOverview.cancel();
      refreshManualSpends.cancel();
      refreshAgencyAccounts.cancel();
      refreshFromMetrics.cancel();
      supabase.removeChannel(channel);
    };
  }, [fetchPurchases, fetchOverview, fetchManualSpends, fetchAgencyAccounts, refreshSnapshot, dateRange]);

  const handleRangeChange = (range: DateRange | null, preset: DatePreset) => {
    setDateRange(range);
    const labels: Record<DatePreset, string> = {
      all_time: "All Time", today: "Today", yesterday: "Yesterday", this_week: "This Week",
      last_week: "Last Week", this_month: "This Month", last_month: "Last Month", custom: "Custom Range",
    };
    setPeriodLabel(labels[preset]);
    fetchPurchases(range);
    fetchManualSpends(range);
    setCurrentPage(1);
    setSpendCurrentPage(1);
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
  const totalManualSpendInRange = manualSpends.reduce((s, m) => s + Number(m.amount_usd), 0);
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
      org_id: profile?.org_id || null,
    } as any);
    
    if (!error && paidFromAccountId) {
      await adjustAccountBalance(paidFromAccountId, -Number(bdtPaid));
    }
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "USD purchase recorded" });
      setBdtPaid(""); setUsdReceived(""); setChargePercent(""); setNotes(""); setPaidFromAccountId("");
      setDialogOpen(false);
      fetchPurchases(dateRange);
      fetchAgencyAccounts();
      refreshSnapshot().then(() => fetchOverview());
    }
  };

  const handleSpendSubmit = async () => {
    if (!spendAmount || Number(spendAmount) <= 0) {
      toast({ title: "Error", description: "Please enter a valid USD amount", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("usd_manual_spends").insert({
      date: spendDate,
      amount_usd: Number(spendAmount),
      category: spendCategory,
      description: spendDescription || null,
      notes: spendNotes || null,
      created_by: user?.id,
      org_id: profile?.org_id || null,
    } as any);
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: `$${Number(spendAmount).toLocaleString()} manual spend recorded` });
      setSpendAmount(""); setSpendCategory("Other"); setSpendDescription(""); setSpendNotes("");
      setSpendDialogOpen(false);
      fetchManualSpends(dateRange);
      refreshSnapshot().then(() => fetchOverview());
    }
  };

  const handleSetOpeningBalance = async () => {
    if (!openingBalance || Number(openingBalance) < 0) {
      toast({ title: "Error", description: "Please enter a valid balance", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("usd_inventory_snapshots" as any).insert({
      snapshot_date: getDhakaDateString(),
      balance_usd: Number(openingBalance),
      notes: openingNotes || "Opening balance",
      created_by: user?.id,
      org_id: profile?.org_id || null,
    } as any);
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Opening balance set. Inventory tracking starts now." });
      setOpeningBalance(""); setOpeningNotes("");
      setOpeningBalanceDialogOpen(false);
      refreshSnapshot().then(() => fetchOverview());
    }
  };

  const handleClosePeriod = async () => {
    setSubmitting(true);
    const { error } = await supabase.from("usd_inventory_snapshots" as any).insert({
      snapshot_date: getDhakaDateString(),
      balance_usd: overview.availableBalance,
      notes: closeNotes || `Period close — Balance: $${overview.availableBalance.toLocaleString()}`,
      created_by: user?.id,
      org_id: profile?.org_id || null,
    } as any);
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Period Closed", description: `Snapshot saved with $${overview.availableBalance.toLocaleString()} balance.` });
      setCloseNotes("");
      setClosePeriodDialogOpen(false);
      refreshSnapshot().then(() => fetchOverview());
    }
  };

  const previewRate = bdtPaid && effectiveUsd > 0
    ? (Number(bdtPaid) / effectiveUsd).toFixed(2)
    : "—";

  const hasSnapshot = overview.snapshotDate !== null;

  const getCategoryBadgeVariant = (cat: string) => {
    switch (cat) {
      case "Subscription": return "default";
      case "Tools/Software": return "secondary";
      case "Hosting": return "outline";
      case "Domain": return "outline";
      case "Transfer": return "secondary";
      case "Refund": return "destructive";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
          <Dialog open={spendDialogOpen} onOpenChange={setSpendDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto"><MinusCircle className="mr-2 h-4 w-4" /> Spend USD</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Manual USD Spend</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={spendDate} onChange={e => setSpendDate(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>USD Amount</Label>
                    <Input type="number" placeholder="e.g. 29.99" value={spendAmount} onChange={e => setSpendAmount(e.target.value)} />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={spendCategory} onValueChange={setSpendCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SPEND_CATEGORIES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input placeholder="e.g. ChatGPT Plus monthly" value={spendDescription} onChange={e => setSpendDescription(e.target.value)} />
                </div>
                <div>
                  <Label>Notes (optional)</Label>
                  <Textarea value={spendNotes} onChange={e => setSpendNotes(e.target.value)} placeholder="Additional details..." />
                </div>
                <Button className="w-full" onClick={handleSpendSubmit} disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Record Spend
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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

      {/* USD Inventory Overview — snapshot-based */}
      <Card className={`border-2 ${
        overview.loading ? "border-border" :
        !hasSnapshot ? "border-primary/50 bg-primary/5" :
        overview.availableBalance < 0 || overview.runwayDays < 3 ? "border-destructive/50 bg-destructive/5" :
        overview.runwayDays <= 7 ? "border-yellow-500/50 bg-yellow-500/5" :
        "border-emerald-500/50 bg-emerald-500/5"
      }`}>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="h-4 w-4" />
                USD Inventory
              </CardTitle>
              {overview.snapshotDate && (
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  <Badge variant="outline" className="text-[10px] font-normal">
                    Since {overview.snapshotDate}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] font-normal gap-1">
                    <Clock className="h-2.5 w-2.5" /> Auto: 5 min
                  </Badge>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!overview.loading && hasSnapshot && (
                <Button size="sm" variant="ghost" onClick={handleRefreshNow} disabled={overview.loading}>
                  <RotateCcw className={`mr-1 h-3.5 w-3.5 ${overview.loading ? "animate-spin" : ""}`} /> Refresh
                </Button>
              )}
              {!overview.loading && !hasSnapshot && (
                <Dialog open={openingBalanceDialogOpen} onOpenChange={setOpeningBalanceDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="default">
                      <CalendarCheck className="mr-1 h-3.5 w-3.5" /> Set Opening Balance
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Set Opening USD Balance</DialogTitle></DialogHeader>
                    <p className="text-sm text-muted-foreground">
                      Enter the USD you currently have in hand. This becomes the starting point for inventory tracking — no need to import old purchase history.
                    </p>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Current USD Balance</Label>
                        <Input type="number" placeholder="e.g. 500" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} />
                      </div>
                      <div>
                        <Label>Notes (optional)</Label>
                        <Textarea value={openingNotes} onChange={e => setOpeningNotes(e.target.value)} placeholder="e.g. Starting inventory count" />
                      </div>
                      <Button className="w-full" onClick={handleSetOpeningBalance} disabled={submitting}>
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Opening Balance
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {!overview.loading && hasSnapshot && (
                <Dialog open={closePeriodDialogOpen} onOpenChange={setClosePeriodDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Close Period
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Close Period & Reset</DialogTitle></DialogHeader>
                    <p className="text-sm text-muted-foreground">
                      This saves your current balance (<span className="font-mono font-medium">${overview.availableBalance.toLocaleString()}</span>) as a new snapshot. Future calculations will start from today.
                    </p>
                    <div className="space-y-4 pt-2">
                      <div className="rounded-lg bg-muted p-4 text-center">
                        <p className="text-xs text-muted-foreground">Current Balance to Carry Forward</p>
                        <p className="text-3xl font-bold font-mono">${overview.availableBalance.toLocaleString()}</p>
                      </div>
                      <div>
                        <Label>Notes (optional)</Label>
                        <Textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="e.g. Q1 2026 close" />
                      </div>
                      <Button className="w-full" onClick={handleClosePeriod} disabled={submitting}>
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Close Period
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!hasSnapshot && !overview.loading ? (
            <div className="text-center py-6">
              <p className="text-muted-foreground text-sm">
                No opening balance set. Click <strong>"Set Opening Balance"</strong> to start tracking your USD inventory.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:gap-4 grid-cols-3 lg:grid-cols-6">
                {/* Available Balance */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Available USD</p>
                  {overview.loading ? <Skeleton className="h-8 w-24" /> : (
                    <p className={`text-lg sm:text-2xl font-bold font-mono ${
                      overview.availableBalance < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
                    }`}>
                      ${overview.availableBalance.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  )}
                </div>

                {/* Carry Forward */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Carry Forward</p>
                  {overview.loading ? <Skeleton className="h-8 w-24" /> : (
                    <p className="text-lg sm:text-2xl font-bold font-mono">
                      ${overview.carryForward.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  )}
                </div>

                {/* Bought Since */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Bought (Since)</p>
                  {overview.loading ? <Skeleton className="h-8 w-24" /> : (
                    <p className="text-lg sm:text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      +${overview.boughtSince.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  )}
                </div>

                {/* Ad Spend */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Ad Spend</p>
                  {overview.loading ? <Skeleton className="h-8 w-24" /> : (
                    <p className="text-lg sm:text-2xl font-bold font-mono text-destructive">
                      -${overview.spentSince.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  )}
                </div>

                {/* Manual Spends */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><MinusCircle className="h-3 w-3" /> Manual Spends</p>
                  {overview.loading ? <Skeleton className="h-8 w-24" /> : (
                    <p className="text-lg sm:text-2xl font-bold font-mono text-orange-600 dark:text-orange-400">
                      -${overview.manualSpend.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  )}
                </div>

                {/* Burn / Runway */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Flame className="h-3 w-3" /> Burn / Runway</p>
                  {overview.loading ? <Skeleton className="h-8 w-24" /> : (
                    <div>
                      <p className="text-sm font-mono text-muted-foreground">
                        ${overview.dailyBurn.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/d
                      </p>
                      <p className={`text-lg sm:text-2xl font-bold font-mono ${
                        overview.runwayDays < 3 ? "text-destructive" :
                        overview.runwayDays <= 7 ? "text-yellow-600 dark:text-yellow-400" :
                        "text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {overview.runwayDays >= 999 ? "∞" : `${overview.runwayDays}d`}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom row: obligations & needed */}
              {!overview.loading && (
                <div className="mt-3 pt-3 border-t space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
                    <span className="text-muted-foreground">
                      Client Obligations: <span className="font-mono font-medium text-foreground">${overview.clientObligations.toLocaleString()}</span>
                      {overview.clientBalances.length > 0 && (
                        <span className="text-muted-foreground ml-1">({overview.clientBalances.length} clients)</span>
                      )}
                    </span>
                    {overview.usdNeeded > 0 ? (
                      <span className="text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        USD Needed: <span className="font-mono font-medium">${overview.usdNeeded.toLocaleString()}</span>
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">USD Needed: $0 ✓</span>
                    )}
                  </div>

                  {/* Per-client obligation breakdown */}
                  {overview.clientBalances.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 select-none">
                        <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                        View client breakdown
                      </summary>
                      <div className="mt-2 rounded-md border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs h-8">Client</TableHead>
                              <TableHead className="text-xs h-8 text-right">Balance (USD)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {overview.clientBalances.map((cb) => (
                              <TableRow key={cb.client_id} className="hover:bg-muted/30">
                                <TableCell className="py-1.5 text-sm">{cb.full_name}</TableCell>
                                <TableCell className="py-1.5 text-sm text-right font-mono font-medium">
                                  ${cb.balance.toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </details>
                  )}
                </div>
              )}
            </>
          )}
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
              <div className="hidden sm:block rounded-lg bg-emerald-500/10 p-2"><DollarSign className="h-5 w-5 text-emerald-600" /></div>
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
              <div className="hidden sm:block rounded-lg bg-yellow-500/10 p-2"><Wallet className="h-5 w-5 text-yellow-600" /></div>
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
              <div className="hidden sm:block rounded-lg bg-orange-500/10 p-2"><MinusCircle className="h-5 w-5 text-orange-600" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Manual Spends ({periodLabel})</p>
                {manualSpendLoading ? <Skeleton className="h-7 w-24" /> : (
                  <p className="text-xl sm:text-2xl font-bold font-mono">${totalManualSpendInRange.toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Purchase & Manual Spend History */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="purchases">
            <TabsList className="mb-4">
              <TabsTrigger value="purchases">Purchase History ({purchases.length})</TabsTrigger>
              <TabsTrigger value="manual-spends">Manual Spends ({manualSpends.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="purchases">
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
            </TabsContent>

            <TabsContent value="manual-spends">
              {manualSpendLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : manualSpends.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No manual spends in this period. Click "Spend USD" to record one.</p>
              ) : (
                <>
                  {/* Mobile card view */}
                  <div className="flex flex-col gap-3 md:hidden">
                    {manualSpends.slice((spendCurrentPage - 1) * spendPageSize, spendCurrentPage * spendPageSize).map(m => (
                      <div key={m.id} className="rounded-xl border p-4 space-y-2 bg-card">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm text-muted-foreground">{m.date}</span>
                          <Badge variant={getCategoryBadgeVariant(m.category) as any}>{m.category}</Badge>
                        </div>
                        <div className="text-sm">
                          <p className="text-xs text-muted-foreground">Amount</p>
                          <p className="font-mono font-medium text-orange-600 dark:text-orange-400">-${Number(m.amount_usd).toLocaleString()}</p>
                        </div>
                        {m.description && <p className="text-sm font-medium">{m.description}</p>}
                        {m.notes && <p className="text-xs text-muted-foreground truncate">{m.notes}</p>}
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">USD Amount</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {manualSpends.slice((spendCurrentPage - 1) * spendPageSize, spendCurrentPage * spendPageSize).map(m => (
                          <TableRow key={m.id}>
                            <TableCell className="font-mono text-sm">{m.date}</TableCell>
                            <TableCell className="text-right font-mono text-orange-600 dark:text-orange-400">-${Number(m.amount_usd).toLocaleString()}</TableCell>
                            <TableCell>
                              <Badge variant={getCategoryBadgeVariant(m.category) as any}>{m.category}</Badge>
                            </TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate">{m.description || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{m.notes || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <TablePagination
                    totalItems={manualSpends.length}
                    pageSize={spendPageSize}
                    currentPage={spendCurrentPage}
                    onPageChange={setSpendCurrentPage}
                    onPageSizeChange={setSpendPageSize}
                  />
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
