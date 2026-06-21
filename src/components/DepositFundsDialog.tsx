import { useState, useEffect, useRef } from "react";
import { useProfile } from "@/hooks/useProfile";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Banknote, CalendarIcon, Loader2, ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/compressImage";

interface DepositFundsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  showClientSelector?: boolean;
  isAdmin?: boolean;
  onSuccess?: () => void;
}

interface AgencyAccount {
  id: string;
  name: string;
  type: string;
}

function deriveMethod(acc: AgencyAccount | undefined): string {
  if (!acc) return "";
  if (acc.type === "Bank") return "Bank";
  if (acc.type === "Cash") return "Cash";
  if (acc.type === "MFS") {
    const n = acc.name.toLowerCase();
    if (n.includes("bkash")) return "bKash";
    if (n.includes("nagad")) return "Nagad";
    if (n.includes("rocket")) return "Rocket";
    if (n.includes("upay")) return "Upay";
    return acc.name;
  }
  return acc.type;
}


const PLATFORMS = [
  { key: "meta", label: "Meta" },
  { key: "tiktok", label: "TikTok" },
  { key: "google", label: "Google" },
] as const;

export function DepositFundsDialog({
  open,
  onOpenChange,
  clientId,
  showClientSelector = false,
  isAdmin = false,
  onSuccess,
}: DepositFundsDialogProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [trxId, setTrxId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedClient, setSelectedClient] = useState(clientId || "");
  const [clients, setClients] = useState<{ user_id: string; full_name: string }[]>([]);
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [agencyAccounts, setAgencyAccounts] = useState<AgencyAccount[]>([]);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multi-platform amounts
  const [platformEnabled, setPlatformEnabled] = useState<Record<string, boolean>>({ meta: false, tiktok: false, google: false });
  const [platformAmounts, setPlatformAmounts] = useState<Record<string, string>>({ meta: "", tiktok: "", google: "" });

  const totalAmount = PLATFORMS.reduce((sum, p) => {
    if (platformEnabled[p.key] && platformAmounts[p.key]) {
      return sum + Number(platformAmounts[p.key]);
    }
    return sum;
  }, 0);

  const hasValidPlatform = PLATFORMS.some(p => platformEnabled[p.key] && Number(platformAmounts[p.key]) > 0);

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

  // Load agency accounts
  useEffect(() => {
    if (!open) return;
    async function loadAccounts() {
      const { data } = await (supabase.from("agency_accounts" as any).select("id, name, type").eq("is_active", true).order("name") as any);
      setAgencyAccounts((data as AgencyAccount[]) || []);
    }
    loadAccounts();
  }, [open]);

  // Sync external clientId prop
  useEffect(() => {
    if (clientId) setSelectedClient(clientId);
  }, [clientId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTrxId("");
      setSubmitting(false);
      setPaymentDate(new Date());
      setSelectedAccountId("");
      setProofFile(null);
      setProofPreview(null);
      setPlatformEnabled({ meta: false, tiktok: false, google: false });
      setPlatformAmounts({ meta: "", tiktok: "", google: "" });
      if (!clientId) setSelectedClient("");
    }
  }, [open, clientId]);

  const resolvedClientId = showClientSelector ? selectedClient : clientId;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 20MB allowed", variant: "destructive" });
      return;
    }
    setProofFile(file);
    const url = URL.createObjectURL(file);
    setProofPreview(url);
  };

  const removeProof = () => {
    setProofFile(null);
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedAccount = agencyAccounts.find((a) => a.id === selectedAccountId);
    const derivedMethod = deriveMethod(selectedAccount);
    if (!hasValidPlatform || !derivedMethod || !resolvedClientId) return;
    setSubmitting(true);

    let proofUrl: string | null = null;

    // Upload proof image if provided
    if (proofFile && resolvedClientId) {
      try {
        const compressed = await compressImage(proofFile, 1200, 0.7);
        const fileName = `${resolvedClientId}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("payment-proofs")
          .upload(fileName, compressed, { contentType: "image/jpeg", upsert: false });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("payment-proofs")
          .getPublicUrl(fileName);
        proofUrl = urlData.publicUrl;
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message || "Could not upload proof image", variant: "destructive" });
        setSubmitting(false);
        return;
      }
    }

    // Build platform_amounts (only non-zero enabled platforms)
    const platformAmountsObj: Record<string, number> = {};
    PLATFORMS.forEach(p => {
      if (platformEnabled[p.key] && Number(platformAmounts[p.key]) > 0) {
        platformAmountsObj[p.key] = Number(platformAmounts[p.key]);
      }
    });

    const enabledKeys = Object.keys(platformAmountsObj);
    const platformValue = enabledKeys.length === 1 ? enabledKeys[0] : null;

    const insertPayload: any = {
      client_id: resolvedClientId,
      amount_bdt: totalAmount,
      payment_method: derivedMethod,
      transaction_id: trxId || null,
      platform: platformValue,
      platform_amounts: platformAmountsObj,
      received_in_account_id: selectedAccountId || null,
      proof_image_url: proofUrl,
      org_id: (profile as any)?.org_id || null,
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
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
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

          {/* Multi-Platform Amount Inputs */}
          <div className="space-y-3">
            <Label>Platform Amounts (BDT)</Label>
            <div className="space-y-2 rounded-lg border p-3">
              {PLATFORMS.map((p) => (
                <div key={p.key} className="flex items-center gap-3">
                  <Checkbox
                    id={`platform-${p.key}`}
                    checked={platformEnabled[p.key]}
                    onCheckedChange={(checked) => {
                      setPlatformEnabled(prev => ({ ...prev, [p.key]: !!checked }));
                      if (!checked) setPlatformAmounts(prev => ({ ...prev, [p.key]: "" }));
                    }}
                  />
                  <label
                    htmlFor={`platform-${p.key}`}
                    className="w-16 text-sm font-medium cursor-pointer select-none"
                  >
                    {p.label}
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="৳ 0.00"
                    value={platformAmounts[p.key]}
                    onChange={(e) => setPlatformAmounts(prev => ({ ...prev, [p.key]: e.target.value }))}
                    disabled={!platformEnabled[p.key]}
                    className="flex-1"
                  />
                </div>
              ))}
              {totalAmount > 0 && (
                <div className="flex justify-between items-center pt-2 border-t mt-2">
                  <span className="text-sm font-medium text-muted-foreground">Total</span>
                  <span className="text-sm font-semibold">৳{totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          </div>

          {/* Paid To Account (also determines payment method) */}
          <div className="space-y-2">
            <Label>Paid To Account</Label>
            {agencyAccounts.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
                No active accounts found. Add an agency account in Finance → Wallet first.
              </p>
            ) : (
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId} required>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {(["Cash", "Bank", "MFS"] as const).map((groupType) => {
                    const accs = agencyAccounts.filter((a) => a.type === groupType);
                    if (accs.length === 0) return null;
                    return (
                      <div key={groupType}>
                        <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {groupType}
                        </div>
                        {accs.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </div>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
            {selectedAccountId && (
              <p className="text-xs text-muted-foreground">
                Method: {deriveMethod(agencyAccounts.find((a) => a.id === selectedAccountId))}
              </p>
            )}
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

          {/* Payment Proof Upload */}
          <div className="space-y-2">
            <Label>Payment Proof (optional)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            {proofPreview ? (
              <div className="relative inline-block">
                <img
                  src={proofPreview}
                  alt="Payment proof"
                  className="h-24 w-auto rounded-lg border object-cover"
                />
                <button
                  type="button"
                  onClick={removeProof}
                  className="absolute -top-2 -right-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow-sm hover:bg-destructive/90"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                Attach Screenshot / Photo
              </Button>
            )}
            <p className="text-xs text-muted-foreground">Image will be compressed before upload</p>
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
            <Button type="submit" disabled={submitting || !method || !hasValidPlatform || !resolvedClientId}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
