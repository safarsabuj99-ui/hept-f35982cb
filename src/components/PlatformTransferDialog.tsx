import { useState, useEffect, useMemo } from "react";
import { getPlatformRates } from "@/lib/pricing";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, RefreshCw } from "lucide-react";

const PLATFORMS = [
  { value: "meta", label: "Meta", color: "hsl(214, 80%, 52%)" },
  { value: "tiktok", label: "TikTok", color: "hsl(340, 75%, 55%)" },
  { value: "google", label: "Google", color: "hsl(142, 60%, 45%)" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | undefined;
  onSuccess: () => void;
}

export function PlatformTransferDialog({ open, onOpenChange, clientId, onSuccess }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [rates, setRates] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open || !clientId) return;
    setFrom("");
    setTo("");
    setAmount("");
    loadData();
  }, [open, clientId]);

  async function loadData() {
    if (!clientId) return;
    const [txRes, profileRes] = await Promise.all([
      supabase.from("transactions").select("type, amount, platform").eq("client_id", clientId).eq("status", "completed"),
      supabase.from("profiles").select("pricing_config").eq("user_id", clientId).single(),
    ]);

    // Calculate balances
    const bals: Record<string, number> = { meta: 0, tiktok: 0, google: 0 };
    (txRes.data || []).forEach((t: any) => {
      if (!t.platform || !bals.hasOwnProperty(t.platform)) return;
      bals[t.platform] += t.type === "credit" ? Number(t.amount) : -Number(t.amount);
    });
    setBalances(bals);

    // Get rates
    const pc = profileRes.data?.pricing_config as any;
    const r = getPlatformRates(pc);
    setRates(r as Record<string, number>);
  }

  const sourceRate = rates[from] || 0;
  const destRate = rates[to] || 0;
  const usd = parseFloat(amount) || 0;
  const bdtAmount = usd * sourceRate;
  const destUsd = destRate > 0 ? bdtAmount / destRate : 0;
  const sourceBalance = balances[from] || 0;
  const isValid = from && to && from !== to && usd > 0 && usd <= sourceBalance && sourceRate > 0 && destRate > 0;

  const toPlatforms = useMemo(() => PLATFORMS.filter((p) => p.value !== from), [from]);

  async function handleSubmit() {
    if (!isValid || !clientId) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("platform-transfer", {
        body: { client_id: clientId, from_platform: from, to_platform: to, amount_usd: usd },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Transfer Complete",
        description: `$${usd.toFixed(2)} ${from} → $${data.dest_usd.toFixed(2)} ${to}`,
      });
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Transfer Failed", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  }

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Platform Balance Transfer
          </DialogTitle>
          <DialogDescription>Transfer USD between platform wallets using the client's configured rates.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* From Platform */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">From Platform</Label>
            <Select value={from} onValueChange={(v) => { setFrom(v); if (to === v) setTo(""); }}>
              <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                      {p.label} — {fmt(balances[p.value] || 0)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* To Platform */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">To Platform</Label>
            <Select value={to} onValueChange={setTo} disabled={!from}>
              <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
              <SelectContent>
                {toPlatforms.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                      {p.label} — {fmt(balances[p.value] || 0)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Amount (USD)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            {from && <p className="text-xs text-muted-foreground">Available: {fmt(sourceBalance)}</p>}
            {usd > sourceBalance && usd > 0 && (
              <p className="text-xs text-destructive">Exceeds available balance</p>
            )}
          </div>

          {/* Conversion Preview */}
          {from && to && usd > 0 && sourceRate > 0 && destRate > 0 && (
            <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5 text-sm">
              <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Conversion Preview</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="capitalize">{from}</Badge>
                <span className="font-mono">{fmt(usd)}</span>
                <span className="text-muted-foreground">× ৳{sourceRate}</span>
                <span className="text-muted-foreground">=</span>
                <span className="font-mono font-semibold">৳{bdtAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono">৳{bdtAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                <span className="text-muted-foreground">÷ ৳{destRate}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <Badge variant="outline" className="capitalize">{to}</Badge>
                <span className="font-mono font-semibold text-primary">{fmt(parseFloat(destUsd.toFixed(2)))}</span>
              </div>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={!isValid || submitting} className="w-full">
            {submitting ? "Processing…" : "Confirm Transfer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
