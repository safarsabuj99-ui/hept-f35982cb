import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { Banknote, CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DepositFundsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  showClientSelector?: boolean;
  isAdmin?: boolean;
  onSuccess?: () => void;
}

export function DepositFundsDialog({
  open,
  onOpenChange,
  clientId,
  showClientSelector = false,
  isAdmin = false,
  onSuccess,
}: DepositFundsDialogProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [trxId, setTrxId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [platform, setPlatform] = useState("");
  const [selectedClient, setSelectedClient] = useState(clientId || "");
  const [clients, setClients] = useState<{ user_id: string; full_name: string }[]>([]);
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());

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
      setPlatform("");
      setSubmitting(false);
      setPaymentDate(new Date());
      if (!clientId) setSelectedClient("");
    }
  }, [open, clientId]);

  const resolvedClientId = showClientSelector ? selectedClient : clientId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0 || !method || !platform || !resolvedClientId) return;
    setSubmitting(true);

    const insertPayload: any = {
      client_id: resolvedClientId,
      amount_bdt: Number(amount),
      payment_method: method,
      transaction_id: trxId || null,
      platform,
    };

    if (paymentDate) {
      insertPayload.payment_date = format(paymentDate, "yyyy-MM-dd");
    }

    const { error } = await (supabase.from("payment_requests" as any).insert(insertPayload) as any);
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
            <Label>Platform</Label>
            <Select value={platform} onValueChange={setPlatform} required>
              <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="meta">Meta</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="google">Google</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
            <Label>Payment Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !paymentDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {paymentDate ? format(paymentDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={paymentDate}
                    onSelect={setPaymentDate}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
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
            <Button type="submit" disabled={submitting || !method || !amount || !platform || !resolvedClientId}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
