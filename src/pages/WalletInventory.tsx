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
import { DollarSign, TrendingUp, Package, Wallet, Plus, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFilter, DateRange, DatePreset, toISODate } from "@/components/DateRangeFilter";

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
  const [notes, setNotes] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [periodLabel, setPeriodLabel] = useState("All Time");
  const [agencyAccounts, setAgencyAccounts] = useState<any[]>([]);
  const [paidFromAccountId, setPaidFromAccountId] = useState("");
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

  useEffect(() => {
    fetchPurchases(dateRange);
    supabase.from("agency_accounts" as any).select("id, name, type, current_balance_bdt").eq("is_active", true).order("name").then(({ data }) => setAgencyAccounts(data ?? []));
  }, []);

  const handleRangeChange = (range: DateRange | null, preset: DatePreset) => {
    setDateRange(range);
    const labels: Record<DatePreset, string> = {
      all_time: "All Time", today: "Today", yesterday: "Yesterday", this_week: "This Week",
      last_week: "Last Week", this_month: "This Month", last_month: "Last Month", custom: "Custom Range",
    };
    setPeriodLabel(labels[preset]);
    fetchPurchases(range);
  };

  // WAC from filtered purchases
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

  const handleSubmit = async () => {
    if (!bdtPaid || !usdReceived || Number(usdReceived) <= 0) {
      toast({ title: "Error", description: "Please fill in valid amounts", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("usd_purchases").insert({
      date: purchaseDate,
      bdt_amount_paid: Number(bdtPaid),
      usd_received: Number(usdReceived),
      notes: notes || null,
      created_by: user?.id,
      paid_from_account_id: paidFromAccountId || null,
    } as any);
    
    // Debit agency account if selected
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
      setBdtPaid(""); setUsdReceived(""); setNotes(""); setPaidFromAccountId("");
      setDialogOpen(false);
      fetchPurchases(dateRange);
    }
  };

  const previewRate = bdtPaid && usdReceived && Number(usdReceived) > 0
    ? (Number(bdtPaid) / Number(usdReceived)).toFixed(2)
    : "—";

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Buy USD</Button>
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

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2"><TrendingUp className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Avg. Cost ({periodLabel})</p>
                {loading ? <Skeleton className="h-7 w-24" /> : (
                  <p className="text-2xl font-bold font-mono">{wac.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">BDT</span></p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-success/10 p-2"><DollarSign className="h-5 w-5 text-success" /></div>
              <div>
                <p className="text-xs text-muted-foreground">USD Purchased ({periodLabel})</p>
                {loading ? <Skeleton className="h-7 w-24" /> : (
                  <p className="text-2xl font-bold font-mono">${totalUsdPurchased.toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-warning/10 p-2"><Wallet className="h-5 w-5 text-warning" /></div>
              <div>
                <p className="text-xs text-muted-foreground">BDT Invested ({periodLabel})</p>
                {loading ? <Skeleton className="h-7 w-24" /> : (
                  <p className="text-2xl font-bold font-mono">৳{totalBdtSpent.toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent p-2"><Package className="h-5 w-5 text-accent-foreground" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Purchases ({periodLabel})</p>
                {loading ? <Skeleton className="h-7 w-16" /> : (
                  <p className="text-2xl font-bold font-mono">{purchases.length}</p>
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
            <div className="overflow-x-auto">
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
                  {purchases.map(p => (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
