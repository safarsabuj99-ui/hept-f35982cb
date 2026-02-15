import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Banknote, Loader2 } from "lucide-react";

interface DepositFundsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  showClientSelector?: boolean;
  onSuccess?: () => void;
}

export function DepositFundsDialog({
  open,
  onOpenChange,
  clientId,
  showClientSelector = false,
  onSuccess,
}: DepositFundsDialogProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [trxId, setTrxId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedClient, setSelectedClient] = useState(clientId || "");
  const [clients, setClients] = useState<{ user_id: string; full_name: string }[]>([]);

  // Load clients list when selector is shown
  useEffect(() => {
    if (!showClientSelector || !open) return;
    async function loadClients() {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
      if (!roles?.length) return;
      const ids = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids)
        .order("full_name");
      setClients(profiles || []);
    }
    loadClients();
  }, [showClientSelector, open]);

  // Sync external clientId prop
  useEffect(() => {
    if (clientId) setSelectedClient(clientId);
  }, [clientId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setAmount("");
      setMethod("");
      setTrxId("");
      setSubmitting(false);
      if (!clientId) setSelectedClient("");
    }
  }, [open, clientId]);

  const resolvedClientId = showClientSelector ? selectedClient : clientId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0 || !method || !resolvedClientId) return;
    setSubmitting(true);
    const { error } = await (supabase.from("payment_requests" as any).insert({
      client_id: resolvedClientId,
      amount_bdt: Number(amount),
      payment_method: method,
      transaction_id: trxId || null,
    }) as any);
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Request Submitted", description: "Payment request has been submitted successfully." });
      onOpenChange(false);
      onSuccess?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" /> Deposit Funds
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {showClientSelector && (
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient} required>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Amount (BDT)</Label>
            <Input
              type="number" step="0.01" min="1"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="৳ 0.00" required
            />
          </div>
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={setMethod} required>
              <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Bank">Bank Transfer</SelectItem>
                <SelectItem value="bKash">bKash</SelectItem>
                <SelectItem value="Nagad">Nagad</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Transaction ID / Note (optional)</Label>
            <Input
              value={trxId} onChange={(e) => setTrxId(e.target.value)}
              placeholder="e.g. TrxID or reference"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting || !method || !amount || !resolvedClientId}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
