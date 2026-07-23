import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Undo2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { adjustAccountBalance } from "@/lib/adjustAccountBalance";

interface PaymentRequestLite {
  id: string;
  client_id: string;
  amount_bdt: number;
  final_amount_usd: number | null;
  exchange_rate_snapshot: any;
  received_in_account_id: string | null;
  platform: string | null;
  platform_amounts: Record<string, number> | null;
  payment_method?: string | null;
  mfs_fee_percent?: number | null;
  client_name?: string;
  org_id?: string | null;
}

interface AgencyAccount { id: string; name: string; type: string; current_balance_bdt: number; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: PaymentRequestLite | null;
  onSuccess?: () => void;
}

export function RefundDialog({ open, onOpenChange, request, onSuccess }: Props) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AgencyAccount[]>([]);
  const [refundedSoFar, setRefundedSoFar] = useState(0);
  const [amountBdt, setAmountBdt] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [amountUsd, setAmountUsd] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOverdraft, setConfirmOverdraft] = useState(false);

  const remainingBdt = useMemo(
    () => Math.max(0, Number(request?.amount_bdt ?? 0) - refundedSoFar),
    [request, refundedSoFar]
  );

  // Derive default single rate from snapshot
  const defaultRate = useMemo(() => {
    const snap = request?.exchange_rate_snapshot;
    if (!snap) return 120;
    if (typeof snap === "number") return Number(snap);
    if (typeof snap === "object") {
      const vals = Object.values(snap).map((v) => Number(v)).filter((n) => !isNaN(n) && n > 0);
      if (vals.length === 0) return 120;
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    }
    return Number(snap) || 120;
  }, [request]);

  useEffect(() => {
    if (!open || !request) return;
    setLoading(true);
    setNote("");
    setConfirmOverdraft(false);
    (async () => {
      const [{ data: accs }, { data: refunds }] = await Promise.all([
        supabase.from("agency_accounts").select("id, name, type, current_balance_bdt").eq("is_active", true).order("name"),
        (supabase.from("refunds" as any).select("amount_bdt").eq("payment_request_id", request.id) as any),
      ]);
      setAccounts((accs as any[]) ?? []);
      const already = ((refunds as any[]) ?? []).reduce((s, r) => s + Number(r.amount_bdt || 0), 0);
      setRefundedSoFar(already);
      const remaining = Math.max(0, Number(request.amount_bdt) - already);
      setAmountBdt(remaining.toFixed(2));
      const r = defaultRate;
      setRate(r.toFixed(2));
      setAmountUsd((remaining / r).toFixed(2));
      setAccountId(request.received_in_account_id || "");
      setLoading(false);
    })();
  }, [open, request, defaultRate]);

  // Live recompute USD when BDT or rate changes
  useEffect(() => {
    const b = Number(amountBdt);
    const r = Number(rate);
    if (b > 0 && r > 0) {
      setAmountUsd((b / r).toFixed(2));
    }
  }, [amountBdt, rate]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const wouldOverdraw = selectedAccount ? Number(selectedAccount.current_balance_bdt) - Number(amountBdt) < 0 : false;

  const handleSubmit = async () => {
    if (!request || !user) return;
    const bdt = Number(amountBdt);
    const r = Number(rate);
    const usd = Number(amountUsd);

    if (!accountId) return toast.error("Select a source account");
    if (!(bdt > 0)) return toast.error("Amount must be greater than 0");
    if (bdt > remainingBdt + 0.001) return toast.error(`Cannot refund more than ৳${remainingBdt.toFixed(2)}`);
    if (!(r > 0)) return toast.error("Exchange rate must be greater than 0");
    if (!(usd > 0)) return toast.error("USD amount must be greater than 0");
    if (note.trim().length < 5) return toast.error("Reason must be at least 5 characters");
    if (wouldOverdraw && !confirmOverdraft) {
      setConfirmOverdraft(true);
      return toast.warning("Source account will go negative. Click Refund again to confirm.");
    }

    setSubmitting(true);

    // 1. Deduct from agency account
    const ok = await adjustAccountBalance(accountId, -bdt);
    if (!ok) {
      setSubmitting(false);
      return toast.error("Failed to update account balance");
    }

    // 2. Client debit transaction (reduces wallet USD)
    const { data: txn, error: txnErr } = await supabase.from("transactions").insert({
      client_id: request.client_id,
      type: "debit",
      amount: usd,
      status: "completed",
      description: `Refund: ${note.trim()}`,
      exchange_rate: r,
      created_by: user.id,
      org_id: request.org_id ?? undefined,
    } as any).select("id").single();

    if (txnErr) {
      // Roll back the account balance
      await adjustAccountBalance(accountId, bdt);
      setSubmitting(false);
      return toast.error(`Refund failed: ${txnErr.message}`);
    }

    // 3. Insert refund audit row
    const { error: refErr } = await supabase.from("refunds" as any).insert({
      payment_request_id: request.id,
      client_id: request.client_id,
      refunded_from_account_id: accountId,
      amount_bdt: bdt,
      exchange_rate: r,
      amount_usd: usd,
      note: note.trim(),
      transaction_id: (txn as any)?.id,
      refunded_by: user.id,
    } as any);

    if (refErr) {
      // Best-effort rollback
      await supabase.from("transactions").delete().eq("id", (txn as any).id);
      await adjustAccountBalance(accountId, bdt);
      setSubmitting(false);
      return toast.error(`Refund failed: ${refErr.message}`);
    }

    // 4. Flip payment_requests.status to 'refunded' if fully refunded
    const totalRefunded = refundedSoFar + bdt;
    if (totalRefunded >= Number(request.amount_bdt) - 0.01) {
      await supabase.from("payment_requests").update({ status: "refunded" as any }).eq("id", request.id);
    }

    // 5. Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action_type: "payment_refunded",
      description: `Refunded ৳${bdt.toFixed(2)} (USD $${usd.toFixed(2)} @ ${r}) to client for payment ${request.id}. Reason: ${note.trim()}`,
      org_id: request.org_id ?? undefined,
    } as any);

    setSubmitting(false);
    toast.success(`Refund of ৳${bdt.toFixed(2)} issued`);
    onOpenChange(false);
    onSuccess?.();
  };

  if (!request) return null;
  const isMultiRate = request.exchange_rate_snapshot && typeof request.exchange_rate_snapshot === "object";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-destructive" /> Refund Payment
          </DialogTitle>
          <DialogDescription>
            Refund funds back to <span className="font-medium">{request.client_name || "client"}</span>. This will deduct from your agency account and reduce the client's wallet balance.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Original</span><span className="font-mono font-semibold">৳{Number(request.amount_bdt).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Already refunded</span><span className="font-mono">৳{refundedSoFar.toLocaleString()}</span></div>
              <div className="flex justify-between border-t pt-1 mt-1"><span className="text-muted-foreground">Refundable</span><span className="font-mono font-bold text-primary">৳{remainingBdt.toLocaleString()}</span></div>
            </div>

            <div>
              <Label>Refund From Account *</Label>
              <Select value={accountId} onValueChange={(v) => { setAccountId(v); setConfirmOverdraft(false); }}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {a.type} (৳{Number(a.current_balance_bdt).toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (BDT) *</Label>
                <Input type="number" step="0.01" value={amountBdt} onChange={(e) => { setAmountBdt(e.target.value); setConfirmOverdraft(false); }} />
              </div>
              <div>
                <Label>Rate (৳/USD) *</Label>
                <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>USD Refund <span className="text-muted-foreground text-xs">(editable — deducted from wallet)</span></Label>
              <Input type="number" step="0.01" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} className="font-mono" />
            </div>

            {isMultiRate && (
              <p className="text-xs text-muted-foreground">
                Original was multi-platform. Default rate is the average of the snapshot ({Object.entries(request.exchange_rate_snapshot as Record<string, any>).map(([k, v]) => `${k}: ৳${v}`).join(", ")}).
              </p>
            )}

            <div>
              <Label>Reason *</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this refund being issued?" rows={2} />
            </div>

            {wouldOverdraw && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs">
                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <span>Source account will go negative (৳{(Number(selectedAccount?.current_balance_bdt || 0) - Number(amountBdt || 0)).toLocaleString()}). Click Refund again to confirm.</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} className="flex-1">Cancel</Button>
              <Button variant="destructive" onClick={handleSubmit} disabled={submitting || remainingBdt <= 0} className="flex-1 gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                {confirmOverdraft && wouldOverdraw ? "Confirm Refund" : "Refund"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
