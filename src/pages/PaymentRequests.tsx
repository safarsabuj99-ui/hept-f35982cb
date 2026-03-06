import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, Banknote, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TablePagination } from "@/components/TablePagination";

interface AgencyAccount {
  id: string;
  name: string;
  type: string;
}

interface RateOption {
  key: string;
  label: string;
  rate: number;
}

interface PaymentRequest {
  id: string;
  client_id: string;
  amount_bdt: number;
  payment_method: string;
  transaction_id: string | null;
  platform: string | null;
  status: string;
  admin_note: string | null;
  exchange_rate_snapshot: number | null;
  final_amount_usd: number | null;
  created_at: string;
  client_name?: string;
}

export default function PaymentRequests() {
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; request: PaymentRequest | null; action: "approved" | "rejected" }>({ open: false, request: null, action: "approved" });
  const [adminNote, setAdminNote] = useState("");
  const [rateOptions, setRateOptions] = useState<RateOption[]>([]);
  const [selectedRateKey, setSelectedRateKey] = useState<string>("");
  const [rateLoading, setRateLoading] = useState(false);
  const [agencyAccounts, setAgencyAccounts] = useState<AgencyAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [overriddenPlatform, setOverriddenPlatform] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { hasPermission } = usePermissions();

  const canManageFinance = hasPermission("can_manage_finance");

  const selectedRate = rateOptions.find((r) => r.key === selectedRateKey);
  const calculatedUsd = selectedRate ? Math.round((confirmModal.request?.amount_bdt ?? 0) / selectedRate.rate * 100) / 100 : 0;
  const { toast } = useToast();

  const fetchRequests = async () => {
    const { data: prs } = await (supabase.from("payment_requests" as any).select("*").order("created_at", { ascending: false }) as any);
    if (!prs || prs.length === 0) { setRequests([]); setLoading(false); return; }

    const clientIds = [...new Set(prs.map((p: any) => p.client_id))];
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, business_name").in("user_id", clientIds as string[]);
    const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p.full_name + (p.business_name ? ` (${p.business_name})` : "")]));

    setRequests(prs.map((p: any) => ({ ...p, client_name: nameMap[p.client_id] || "Unknown" })));
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel("payment-requests-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_requests" }, () => fetchRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const openConfirm = async (request: PaymentRequest, action: "approved" | "rejected") => {
    setAdminNote("");
    setRateOptions([]);
    setSelectedRateKey("");
    setSelectedAccountId("");
    setConfirmModal({ open: true, request, action });

    if (action === "approved") {
      setRateLoading(true);
      const [profileRes, accRes] = await Promise.all([
        supabase.from("profiles").select("pricing_config").eq("user_id", request.client_id).single(),
        supabase.from("agency_accounts" as any).select("id, name, type").eq("is_active", true).order("name"),
      ]);

      const profile = profileRes.data;
      const pricingConfig = profile?.pricing_config as any;
      const platformRates = pricingConfig?.flat_rates || pricingConfig?.platform_rates || {};

      const options: RateOption[] = [];
      if (platformRates.meta) options.push({ key: "meta", label: "Meta Rate", rate: Number(platformRates.meta) });
      if (platformRates.tiktok) options.push({ key: "tiktok", label: "TikTok Rate", rate: Number(platformRates.tiktok) });
      if (platformRates.google) options.push({ key: "google", label: "Google Rate", rate: Number(platformRates.google) });

      if (options.length === 0) options.push({ key: "default", label: "Default Rate", rate: 120 });

      setRateOptions(options);
      // Auto-select matching platform rate if request has a platform
      const matchingKey = request.platform && options.find(o => o.key === request.platform) ? request.platform : options[0]?.key;
      setSelectedRateKey(matchingKey ?? "default");
      setAgencyAccounts((accRes.data as any[]) ?? []);
      setRateLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmModal.request) return;
    const reqId = confirmModal.request.id;
    setProcessing(reqId);

    const { data, error } = await supabase.functions.invoke("approve-payment", {
      body: {
        request_id: reqId,
        action: confirmModal.action,
        admin_note: adminNote || undefined,
        selected_rate: selectedRate?.rate ?? undefined,
        received_in_account_id: selectedAccountId || undefined,
      },
    });

    setProcessing(null);
    setConfirmModal({ open: false, request: null, action: "approved" });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data?.error) {
      toast({ title: "Error", description: data.error, variant: "destructive" });
    } else {
      const msg = confirmModal.action === "approved"
        ? `Approved: $${data.final_amount_usd} credited at rate ${data.exchange_rate}`
        : "Payment request rejected";
      toast({ title: confirmModal.action === "approved" ? "Approved ✓" : "Rejected", description: msg });
      fetchRequests();
    }
  };

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Pending</Badge>;
    if (status === "approved") return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Approved</Badge>;
    return <Badge variant="destructive">Rejected</Badge>;
  };

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const paginatedRequests = requests.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Banknote className="h-6 w-6 text-primary" /> Payment Requests
        </h1>
        <p className="text-muted-foreground">Approve or reject client offline payment deposits</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : requests.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No payment requests yet</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead className="text-right">Amount (BDT)</TableHead>
                      <TableHead className="hidden md:table-cell">TrxID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell text-right">USD Credited</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRequests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                        <TableCell className="font-medium">{r.client_name}</TableCell>
                        <TableCell><Badge variant="secondary">{r.payment_method}</Badge></TableCell>
                        <TableCell>
                          {r.platform ? <Badge variant="outline" className="capitalize text-xs">{r.platform}</Badge> : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">৳{fmt(r.amount_bdt)}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{r.transaction_id || "—"}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="hidden lg:table-cell text-right font-mono">
                          {r.final_amount_usd ? `$${fmt(r.final_amount_usd)}` : "—"}
                        </TableCell>
                        <TableCell>
                          {r.status === "pending" && canManageFinance ? (
                            <div className="flex items-center justify-center gap-2">
                              <Button size="sm" onClick={() => openConfirm(r, "approved")} disabled={processing === r.id} className="gap-1">
                                {processing === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                                Approve
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => openConfirm(r, "rejected")} disabled={processing === r.id} className="gap-1">
                                <XCircle className="h-3 w-3" /> Reject
                              </Button>
                            </div>
                          ) : r.status === "pending" ? (
                            <span className="text-xs text-muted-foreground text-center block">View only</span>
                          ) : (
                            <span className="text-xs text-muted-foreground text-center block">
                              {r.exchange_rate_snapshot ? `Rate: ${r.exchange_rate_snapshot}` : "—"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePagination
                totalItems={requests.length}
                pageSize={pageSize}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Modal */}
      <Dialog open={confirmModal.open} onOpenChange={(open) => !open && setConfirmModal({ open: false, request: null, action: "approved" })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmModal.action === "approved" ? (
                <><CheckCircle className="h-5 w-5 text-emerald-500" /> Confirm Approval</>
              ) : (
                <><AlertTriangle className="h-5 w-5 text-destructive" /> Confirm Rejection</>
              )}
            </DialogTitle>
            <DialogDescription>
              {confirmModal.action === "approved"
                ? "Review the conversion details before crediting the client's wallet."
                : "This will reject the payment request. The client will be notified."}
            </DialogDescription>
          </DialogHeader>

          {confirmModal.request && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Client</span>
                  <span className="font-medium">{confirmModal.request.client_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount Sent</span>
                  <span className="font-mono font-semibold">৳{fmt(confirmModal.request.amount_bdt)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Platform</span>
                  <span>
                    {confirmModal.request.platform ? (
                      <Badge variant="outline" className={`capitalize text-xs ${
                        confirmModal.request.platform === 'meta' ? 'bg-blue-500/10 text-blue-600 border-blue-500/30' :
                        confirmModal.request.platform === 'tiktok' ? 'bg-slate-500/10 text-slate-700 border-slate-500/30' :
                        'bg-red-500/10 text-red-600 border-red-500/30'
                      }`}>{confirmModal.request.platform}</Badge>
                    ) : (
                      <span className="text-muted-foreground italic">Not specified</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Method</span>
                  <span>{confirmModal.request.payment_method}</span>
                </div>
                {confirmModal.request.transaction_id && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">TrxID</span>
                    <span className="font-mono text-xs">{confirmModal.request.transaction_id}</span>
                  </div>
                )}
              </div>

              {confirmModal.action === "approved" && (
                <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
                  {rateLoading ? (
                    <div className="flex items-center justify-center py-2"><Loader2 className="h-4 w-4 animate-spin" /></div>
                  ) : rateOptions.length > 0 ? (
                    <>
                      <Label className="text-sm font-medium">Select Dollar Rate</Label>
                      <RadioGroup value={selectedRateKey} onValueChange={setSelectedRateKey} className="space-y-2">
                        {rateOptions.map((opt) => (
                          <div key={opt.key} className="flex items-center justify-between rounded-md border p-3 cursor-pointer hover:bg-muted/50" onClick={() => setSelectedRateKey(opt.key)}>
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value={opt.key} id={`rate-${opt.key}`} />
                              <Label htmlFor={`rate-${opt.key}`} className="cursor-pointer font-normal">
                                {opt.label}
                                {confirmModal.request?.platform && opt.key === confirmModal.request.platform && (
                                  <span className="ml-1.5 text-xs text-primary font-medium">(matches request)</span>
                                )}
                              </Label>
                            </div>
                            <span className="font-mono text-sm text-muted-foreground">৳{opt.rate}</span>
                          </div>
                        ))}
                      </RadioGroup>
                      <div className="flex justify-between text-sm border-t pt-2 mt-2">
                        <span className="font-medium">Credit to Wallet</span>
                        <span className="text-lg font-bold text-primary font-mono">${fmt(calculatedUsd)}</span>
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              {confirmModal.action === "approved" && agencyAccounts.length > 0 && (
                <div className="space-y-2">
                  <Label>Received In Account</Label>
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account (optional)" /></SelectTrigger>
                    <SelectContent>
                      {agencyAccounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Admin Note (optional)</Label>
                <Textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmModal({ open: false, request: null, action: "approved" })}>
              Cancel
            </Button>
            <Button
              variant={confirmModal.action === "approved" ? "default" : "destructive"}
              onClick={handleConfirm}
              disabled={processing !== null || rateLoading}
            >
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {confirmModal.action === "approved" ? "Yes, Approve" : "Reject Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
