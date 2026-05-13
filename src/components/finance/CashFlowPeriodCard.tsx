import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Lock, TrendingUp, Wallet, AlertTriangle, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { aggregateFinance } from "@/lib/finance/aggregate";

interface Snapshot {
  id: string;
  snapshot_date: string;
  period_start_date: string;
  carry_forward_bdt: number;
  closing_balance_bdt: number;
  take_home_profit_bdt: number;
}

interface Props {
  /** Sum of all active agency_accounts.current_balance_bdt */
  currentBalance: number;
  /** Earliest agency_account.created_at — used as fallback period start when there is no snapshot */
  fallbackPeriodStart: string | null;
  /** Refresh callback so parent can refetch after a close */
  onClosed?: () => void;
}

const fmt = (n: number) => `৳${Math.round(n).toLocaleString()}`;

export default function CashFlowPeriodCard({ currentBalance, fallbackPeriodStart, onClosed }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [previous, setPrevious] = useState<Snapshot | null>(null);
  const [profit, setProfit] = useState(0);
  const [profitLoading, setProfitLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [carryEdit, setCarryEdit] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const periodStart = useMemo(() => {
    if (latest) return new Date(latest.snapshot_date);
    if (fallbackPeriodStart) return new Date(fallbackPeriodStart);
    return new Date();
  }, [latest, fallbackPeriodStart]);

  const opening = latest ? Number(latest.carry_forward_bdt) : currentBalance;
  const expected = opening + profit;
  const variance = currentBalance - expected;
  const variancePct = opening > 0 ? Math.abs(variance) / opening : 0;
  const variancAlert = variancePct > 0.01;

  const fetchSnapshots = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("cash_flow_snapshots" as any)
      .select("id, snapshot_date, period_start_date, carry_forward_bdt, closing_balance_bdt, take_home_profit_bdt")
      .order("snapshot_date", { ascending: false })
      .limit(2);
    const rows = (data as any[]) ?? [];
    setLatest(rows[0] ?? null);
    setPrevious(rows[1] ?? null);
    setLoading(false);
  };

  useEffect(() => { fetchSnapshots(); }, []);

  // Compute take-home profit for the period
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProfitLoading(true);
      try {
        const from = new Date(periodStart);
        const to = new Date();
        const agg = await aggregateFinance({ from, to });
        if (!cancelled) setProfit(agg.takeHome || 0);
      } finally {
        if (!cancelled) setProfitLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [periodStart.getTime()]);

  const openDialog = () => {
    setCarryEdit(String(Math.round(currentBalance)));
    setNote("");
    setOpen(true);
  };

  const handleClose = async () => {
    const carry = Number(carryEdit);
    if (!Number.isFinite(carry) || carry < 0) {
      toast({ title: "Invalid amount", description: "Carry-forward must be a positive number", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("cash_flow_snapshots" as any).insert({
      snapshot_date: new Date().toISOString(),
      period_start_date: periodStart.toISOString(),
      opening_balance_bdt: opening,
      closing_balance_bdt: currentBalance,
      take_home_profit_bdt: profit,
      carry_forward_bdt: carry,
      variance_bdt: variance,
      note: note || null,
      created_by: user?.id!,
    } as any);
    setSubmitting(false);
    if (error) {
      toast({ title: "Failed to close period", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Period closed", description: `Carry-forward set to ${fmt(carry)}` });
    setOpen(false);
    await fetchSnapshots();
    onClosed?.();
  };

  return (
    <div className="glass-card glow-border animate-slide-up-fade">
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Cash Flow Period
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                Period start: {format(periodStart, "dd MMM yyyy")}
              </Badge>
              {previous && (
                <Badge variant="secondary" className="text-xs">
                  Last close: {format(new Date(previous.snapshot_date), "dd MMM yyyy")} → {fmt(Number(previous.carry_forward_bdt))}
                </Badge>
              )}
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openDialog} disabled={loading}>
                <Lock className="h-4 w-4 mr-1.5" />
                Close Period
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Close Cash Flow Period</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Opening</span><span className="font-mono">{fmt(opening)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">+ Take-home profit</span><span className="font-mono text-emerald-600 dark:text-emerald-400">{fmt(profit)}</span></div>
                  <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Current balance</span><span className="font-mono font-semibold">{fmt(currentBalance)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Variance</span><span className={`font-mono ${variance < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>{variance >= 0 ? "+" : ""}{fmt(variance)}</span></div>
                </div>
                <div>
                  <Label>Carry-forward to next period (BDT)</Label>
                  <Input type="number" value={carryEdit} onChange={(e) => setCarryEdit(e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">Defaults to current balance — edit if you need to adjust.</p>
                </div>
                <div>
                  <Label>Note (optional)</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. April month-end close" rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
                <Button onClick={handleClose} disabled={submitting}>{submitting ? "Closing…" : "Confirm Close"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : (
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Stat label="Opening Balance" value={fmt(opening)} />
              <Stat
                label="Take-home Profit"
                value={profitLoading ? "…" : fmt(profit)}
                hint="since period start"
                icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
              />
              <Stat
                label="Expected Balance"
                value={fmt(expected)}
                hint="opening + profit"
                icon={<ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
              />
              <Stat
                label="Current Balance"
                value={fmt(currentBalance)}
                hint={
                  <span className={`flex items-center gap-1 ${variancAlert ? "text-destructive" : "text-muted-foreground"}`}>
                    {variancAlert && <AlertTriangle className="h-3 w-3" />}
                    Variance: {variance >= 0 ? "+" : ""}{fmt(variance)}
                  </span>
                }
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint, icon }: { label: string; value: string; hint?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/40 border border-border p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="font-mono font-semibold text-base mt-1">{value}</div>
      {hint && <div className="text-[11px] mt-0.5">{hint}</div>}
    </div>
  );
}
