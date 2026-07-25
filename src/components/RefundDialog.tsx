import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Undo2, AlertTriangle, Wallet } from "lucide-react";
import { toast } from "sonner";
import { adjustAccountBalance } from "@/lib/adjustAccountBalance";
import { computeWalletBalance } from "@/lib/walletBalance";
import { fetchAllRows } from "@/lib/fetchAllRows";

export interface RefundClient {
  id: string;
  name?: string;
  org_id?: string | null;
}

interface AgencyAccount { id: string; name: string; type: string; current_balance_bdt: number; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  client: RefundClient | null;
  onSuccess?: () => void;
}

interface RateSource {
  rate: number;
  paymentId: string | null;
  paymentDate: string | null;
  amountBdt: number | null;
  amountUsd: number | null;
}

interface RefundSnapshot {
  accounts: AgencyAccount[];
  txns: any[];
  lastPayment: any | null;
  lastCredit: any | null;
}

async function fetchRefundSnapshot(clientId: string): Promise<RefundSnapshot> {
  const [{ data: accs }, txns, { data: lastPayment }, { data: lastCredit }] = await Promise.all([
    supabase.from("agency_accounts").select("id, name, type, current_balance_bdt").eq("is_active", true).order("name"),
    fetchAllRows<any>(() =>
      supabase.from("transactions").select("type, amount, status, platform").eq("client_id", clientId).eq("status", "completed")
    ),
    supabase.from("payment_requests")
      .select("id, amount_bdt, final_amount_usd, exchange_rate_snapshot, payment_date, created_at, status")
      .eq("client_id", clientId)
      .in("status", ["approved", "refunded"])
      .order("payment_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("transactions")
      .select("exchange_rate, created_at")
      .eq("client_id", clientId)
      .eq("status", "completed")
      .eq("type", "credit")
      .gt("exchange_rate", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    accounts: ((accs as AgencyAccount[]) ?? []),
    txns: txns ?? [],
    lastPayment: lastPayment ?? null,
    lastCredit: lastCredit ?? null,
  };
}

export function RefundDialog({ open, onOpenChange, client, onSuccess }: Props) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AgencyAccount[]>([]);
  const [walletUsd, setWalletUsd] = useState(0);
  const [rateSource, setRateSource] = useState<RateSource>({
    rate: 120, paymentId: null, paymentDate: null, amountBdt: null, amountUsd: null,
  });
  const [amountUsd, setAmountUsd] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [amountBdt, setAmountBdt] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOverdraft, setConfirmOverdraft] = useState(false);
  const [walletClientId, setWalletClientId] = useState("");
  // Track which field the admin edited last so we don't fight their input
  const [lastEdited, setLastEdited] = useState<"usd" | "bdt">("usd");

  useEffect(() => {
    if (!open || !client) return;
    setLoading(true);
    setNote("");
    setConfirmOverdraft(false);
    setAmountUsd("");
    setAmountBdt("");
    setAccountId("");
    setWalletClientId(client.id);
    setLastEdited("usd");
    (async () => {
      let resolvedClientId = client.id;
      let snapshot = await fetchRefundSnapshot(resolvedClientId);

      if (snapshot.txns.length === 0 && !snapshot.lastPayment && !snapshot.lastCredit) {
        const { data: profileByRowId } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", client.id)
          .maybeSingle();

        const profileUserId = (profileByRowId as any)?.user_id;
        if (profileUserId && profileUserId !== client.id) {
          resolvedClientId = profileUserId;
          snapshot = await fetchRefundSnapshot(resolvedClientId);
        }
      }

      setWalletClientId(resolvedClientId);
      setAccounts(snapshot.accounts);

      const wallet = computeWalletBalance(snapshot.txns ?? []);
      setWalletUsd(wallet.total);

      // Derive rate: 1) last approved/refunded payment, 2) last credit txn's exchange_rate, 3) default 120
      let derivedRate = 120;
      let src: RateSource = { rate: 120, paymentId: null, paymentDate: null, amountBdt: null, amountUsd: null };
      if (snapshot.lastPayment) {
        const bdt = Number((snapshot.lastPayment as any).amount_bdt || 0);
        const usd = Number((snapshot.lastPayment as any).final_amount_usd || 0);
        let r = 0;
        if (bdt > 0 && usd > 0) {
          r = bdt / usd;
        } else {
          const snap = (snapshot.lastPayment as any).exchange_rate_snapshot;
          if (typeof snap === "number") r = Number(snap) || 0;
          else if (snap && typeof snap === "object") {
            const vals = Object.values(snap).map((v) => Number(v)).filter((n) => !isNaN(n) && n > 0);
            if (vals.length) r = vals.reduce((s, v) => s + v, 0) / vals.length;
          }
        }
        if (r > 0) {
          derivedRate = r;
          src = {
            rate: r,
            paymentId: (snapshot.lastPayment as any).id,
            paymentDate: (snapshot.lastPayment as any).payment_date || (snapshot.lastPayment as any).created_at,
            amountBdt: bdt || null,
            amountUsd: usd || null,
          };
        }
      }
      if (src.paymentId === null && snapshot.lastCredit && Number((snapshot.lastCredit as any).exchange_rate) > 0) {
        derivedRate = Number((snapshot.lastCredit as any).exchange_rate);
        src = {
          rate: derivedRate,
          paymentId: "txn",
          paymentDate: (snapshot.lastCredit as any).created_at,
          amountBdt: null,
          amountUsd: null,
        };
      }
      setRateSource(src);
      setRate(derivedRate.toFixed(4));
      setLoading(false);
    })();
  }, [open, client]);

  // Live recompute BDT ↔ USD, driven by lastEdited so we don't overwrite what the user is typing
  useEffect(() => {
    const r = Number(rate);
    if (!(r > 0)) return;
    if (lastEdited === "usd") {
      const u = Number(amountUsd);
      if (u > 0) setAmountBdt((u * r).toFixed(2));
      else setAmountBdt("");
    } else {
      const b = Number(amountBdt);
      if (b > 0) setAmountUsd((b / r).toFixed(2));
      else setAmountUsd("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountUsd, amountBdt, rate, lastEdited]);

  const availableUsd = Math.max(0, walletUsd);
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const wouldOverdraw = selectedAccount ? Number(selectedAccount.current_balance_bdt) - Number(amountBdt || 0) < 0 : false;

  const handleSubmit = async () => {
    if (!client || !user) return;
    if (!walletClientId) return toast.error("Client wallet is still loading. Please try again.");
    const usd = Number(amountUsd);
    const r = Number(rate);
    const bdt = Number(amountBdt);

    if (!accountId) return toast.error("Select the account to refund from");
    if (!(usd > 0)) return toast.error("USD amount must be greater than 0");
    if (usd > availableUsd + 0.001) return toast.error(`Cannot refund more than $${availableUsd.toFixed(2)} — that's the client's wallet balance`);
    if (!(r > 0)) return toast.error("Exchange rate must be greater than 0");
    if (!(bdt > 0)) return toast.error("BDT amount must be greater than 0");
    if (note.trim().length < 5) return toast.error("Reason must be at least 5 characters");
    if (wouldOverdraw && !confirmOverdraft) {
      setConfirmOverdraft(true);
      return toast.warning("Source account will go negative. Click Refund again to confirm.");
    }

    setSubmitting(true);

    // 1. Deduct from agency account (BDT)
    const ok = await adjustAccountBalance(accountId, -bdt);
    if (!ok) {
      setSubmitting(false);
      return toast.error("Failed to update account balance");
    }

    // 2. Client debit transaction (reduces wallet USD)
    const { data: txn, error: txnErr } = await supabase.from("transactions").insert({
      client_id: walletClientId,
      type: "debit",
      amount: usd,
      status: "completed",
      description: `Refund: ${note.trim()}`,
      exchange_rate: r,
      created_by: user.id,
      org_id: client.org_id ?? undefined,
    } as any).select("id").single();

    if (txnErr) {
      await adjustAccountBalance(accountId, bdt); // rollback
      setSubmitting(false);
      return toast.error(`Refund failed: ${txnErr.message}`);
    }

    // 3. Refund audit row (standalone — no payment_request_id)
    const { error: refErr } = await supabase.from("refunds" as any).insert({
      payment_request_id: null,
      client_id: walletClientId,
      refunded_from_account_id: accountId,
      amount_bdt: bdt,
      exchange_rate: r,
      amount_usd: usd,
      note: note.trim(),
      transaction_id: (txn as any)?.id,
      refunded_by: user.id,
      effective_rate: r,
    } as any);

    if (refErr) {
      await supabase.from("transactions").delete().eq("id", (txn as any).id);
      await adjustAccountBalance(accountId, bdt);
      setSubmitting(false);
      return toast.error(`Refund failed: ${refErr.message}`);
    }

    // 4. Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action_type: "wallet_refund",
      description: `Refunded $${usd.toFixed(2)} (৳${bdt.toFixed(2)} @ ${r.toFixed(4)}) to ${client.name || "client"} from wallet balance. Reason: ${note.trim()}`,
      org_id: client.org_id ?? undefined,
    } as any);

    setSubmitting(false);
    toast.success(`Refund of $${usd.toFixed(2)} issued`);
    onOpenChange(false);
    onSuccess?.();
  };

  if (!client) return null;

  const overRefund = Number(amountUsd) > availableUsd + 0.001;
  const rateDateStr = rateSource.paymentDate ? new Date(rateSource.paymentDate).toLocaleDateString() : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-destructive" /> Refund from Wallet
          </DialogTitle>
          <DialogDescription>
            Refund USD from <span className="font-medium">{client.name || "client"}</span>'s wallet balance. The BDT equivalent is deducted from the selected agency account.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {/* Wallet snapshot */}
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> Available to refund</span>
                <span className={`font-mono font-bold ${availableUsd > 0 ? "text-primary" : "text-muted-foreground"}`}>
                  ${availableUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Auto-detected rate</span>
                <span className="font-mono">৳{Number(rate || 120).toFixed(4)} / USD</span>
              </div>
              {rateSource.paymentId === "txn" ? (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  From last credit transaction on {rateDateStr}
                </p>
              ) : rateSource.paymentId ? (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  From last payment on {rateDateStr}
                  {rateSource.amountBdt && rateSource.amountUsd
                    ? ` — ৳${rateSource.amountBdt.toLocaleString()} → $${rateSource.amountUsd.toFixed(2)}`
                    : ""}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">No prior payments — using default rate ৳120.</p>
              )}
            </div>

            {availableUsd <= 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>This client has no positive USD balance. There is nothing to refund from the wallet.</span>
              </div>
            )}

            {/* USD → BDT inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Refund (USD) *</Label>
                <Input
                  type="number" step="0.01" min="0" value={amountUsd}
                  onChange={(e) => { setLastEdited("usd"); setAmountUsd(e.target.value); setConfirmOverdraft(false); }}
                  className="font-mono"
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Rate (৳/USD) *</Label>
                <Input
                  type="number" step="0.0001" min="0" value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>

            <div>
              <Label>Deducted from account (BDT) <span className="text-muted-foreground text-xs">(editable)</span></Label>
              <Input
                type="number" step="0.01" min="0" value={amountBdt}
                onChange={(e) => { setLastEdited("bdt"); setAmountBdt(e.target.value); setConfirmOverdraft(false); }}
                className="font-mono"
                placeholder="0.00"
              />
            </div>

            {/* Quick-fill max */}
            {availableUsd > 0 && Number(amountUsd) !== availableUsd && (
              <button
                type="button"
                onClick={() => { setLastEdited("usd"); setAmountUsd(availableUsd.toFixed(2)); }}
                className="text-xs text-primary hover:underline"
              >
                Refund full balance (${availableUsd.toFixed(2)})
              </button>
            )}

            {overRefund && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs">
                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <span>Refund exceeds wallet balance by ${(Number(amountUsd) - availableUsd).toFixed(2)}.</span>
              </div>
            )}

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
              <Button
                variant="destructive"
                onClick={handleSubmit}
                disabled={submitting || availableUsd <= 0 || overRefund}
                className="flex-1 gap-2"
              >
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
