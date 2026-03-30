import { useEffect, useState, useMemo } from "react";
import { getPlatformRates } from "@/lib/pricing";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableSkeleton } from "@/components/ui/premium-skeletons";
import { DateRangeFilter, type DateRange, type DatePreset } from "@/components/DateRangeFilter";
import { format } from "date-fns";

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
  proof_image_url?: string | null;
  received_in_account_id?: string | null;
}

interface PendingDeposit {
  id: string;
  client_id: string;
  amount: number;
  description: string | null;
  date: string;
  created_at: string;
  created_by: string;
  client_name?: string;
  creator_name?: string;
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
  const [deposits, setDeposits] = useState<PendingDeposit[]>([]);
  const [depositsLoading, setDepositsLoading] = useState(true);
  const [depositPage, setDepositPage] = useState(1);
  const [depositPageSize, setDepositPageSize] = useState(20);
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

  const fetchDeposits = async () => {
    const { data: txns } = await (supabase
      .from("transactions")
      .select("*")
      .eq("type", "credit") as any)
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false });

    if (!txns || txns.length === 0) {
      setDeposits([]);
      setDepositsLoading(false);
      return;
    }

    const userIds = [...new Set([...txns.map((t: any) => t.client_id), ...txns.map((t: any) => t.created_by)])];
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
    const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p.full_name]));

    setDeposits(
      txns.map((t: any) => ({
        ...t,
        client_name: nameMap[t.client_id] || "Unknown",
        creator_name: nameMap[t.created_by] || "Unknown",
      }))
    );
    setDepositsLoading(false);
  };

  useEffect(() => { fetchRequests(); fetchDeposits(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel("payment-requests-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_requests" }, () => fetchRequests())
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => fetchDeposits())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleDepositAction = async (id: string, status: "completed" | "rejected") => {
    setProcessing(id);
    const { error } = await supabase
      .from("transactions")
      .update({ status } as any)
      .eq("id", id);

    setProcessing(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: status === "completed" ? "Approved" : "Rejected", description: `Deposit ${status}` });
      fetchDeposits();
    }
  };

  const openConfirm = async (request: PaymentRequest, action: "approved" | "rejected") => {
    setAdminNote("");
    setRateOptions([]);
    setSelectedRateKey("");
    setSelectedAccountId("");
    setOverriddenPlatform(request.platform || "");
    setConfirmModal({ open: true, request, action });

    if (action === "approved") {
      setRateLoading(true);
      const [profileRes, accRes] = await Promise.all([
        supabase.from("profiles").select("pricing_config").eq("user_id", request.client_id).single(),
        supabase.from("agency_accounts" as any).select("id, name, type").eq("is_active", true).order("name"),
      ]);

      const profile = profileRes.data;
      const pricingConfig = profile?.pricing_config as any;
      const platformRates = getPlatformRates(pricingConfig);

      const options: RateOption[] = [
        { key: "meta", label: "Meta Rate", rate: Number(platformRates.meta) || 120 },
        { key: "tiktok", label: "TikTok Rate", rate: Number(platformRates.tiktok) || 120 },
        { key: "google", label: "Google Rate", rate: Number(platformRates.google) || 120 },
      ];

      setRateOptions(options);
      const platform = request.platform || "";
      const matchingKey = platform && options.find(o => o.key === platform) ? platform : options[0]?.key;
      setSelectedRateKey(matchingKey ?? "default");
      setAgencyAccounts((accRes.data as any[]) ?? []);
      setRateLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmModal.request) return;
    const reqId = confirmModal.request.id;
    setProcessing(reqId);

    const platformToSend = overriddenPlatform || confirmModal.request.platform || undefined;
    const { data, error } = await supabase.functions.invoke("approve-payment", {
      body: {
        request_id: reqId,
        action: confirmModal.action,
        admin_note: adminNote || undefined,
        selected_rate: selectedRate?.rate ?? undefined,
        received_in_account_id: selectedAccountId || undefined,
        platform_override: platformToSend,
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

  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("all_time");

  const handleDateChange = (range: DateRange | null, preset: DatePreset) => {
    setDateRange(range);
    setDatePreset(preset);
    setCurrentPage(1);
    setDepositPage(1);
  };

  const filteredRequests = useMemo(() => {
    if (!dateRange) return requests;
    const fromStr = format(dateRange.from, "yyyy-MM-dd");
    const toStr = format(dateRange.to, "yyyy-MM-dd");
    return requests.filter((r) => {
      const d = ((r as any).payment_date || r.created_at)?.substring(0, 10);
      return d >= fromStr && d <= toStr;
    });
  }, [requests, dateRange]);

  const filteredDeposits = useMemo(() => {
    if (!dateRange) return deposits;
    const fromStr = format(dateRange.from, "yyyy-MM-dd");
    const toStr = format(dateRange.to, "yyyy-MM-dd");
    return deposits.filter((d) => {
      const dt = d.date?.substring(0, 10);
      return dt >= fromStr && dt <= toStr;
    });
  }, [deposits, dateRange]);

  const paginatedRequests = filteredRequests.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const paginatedDeposits = filteredDeposits.slice((depositPage - 1) * depositPageSize, depositPage * depositPageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Banknote className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> Payments & Deposits
        </h1>
        <p className="text-muted-foreground text-sm">Manage client payment requests and fund deposit approvals</p>
      </div>

      <DateRangeFilter onRangeChange={handleDateChange} />

      <Tabs defaultValue="payments" className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto scrollbar-hide justify-start">
          <TabsTrigger value="payments" className="gap-2 flex-shrink-0">
            Payment Requests
            {requests.filter(r => r.status === "pending").length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {requests.filter(r => r.status === "pending").length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="deposits" className="gap-2 flex-shrink-0">
            Fund Deposits
            {deposits.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {deposits.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payments">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <TableSkeleton rows={5} columns={9} />
              ) : filteredRequests.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No payment requests yet</p>
              ) : (
                <>
                  {/* Mobile card view */}
                  <div className="flex flex-col gap-3 md:hidden">
                    {paginatedRequests.map((r) => (
                      <div key={r.id} className="rounded-xl border p-4 space-y-3 bg-card">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{r.client_name}</span>
                          {statusBadge(r.status)}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Amount</p>
                            <p className="font-mono font-semibold">৳{fmt(r.amount_bdt)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Method</p>
                            <Badge variant="secondary">{r.payment_method}</Badge>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Date</p>
                            <p className="text-xs font-mono">{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Platform</p>
                            {r.platform ? <Badge variant="outline" className="capitalize text-xs">{r.platform}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </div>
                        {r.final_amount_usd && (
                          <p className="text-xs text-muted-foreground">USD Credited: <span className="font-mono font-medium text-foreground">${fmt(r.final_amount_usd)}</span></p>
                        )}
                        {(r as any).proof_image_url && (
                          <a href={(r as any).proof_image_url} target="_blank" rel="noopener noreferrer">
                            <img src={(r as any).proof_image_url} alt="Proof" className="h-16 w-auto rounded border object-cover" />
                          </a>
                        )}
                        {r.status === "pending" && canManageFinance && (
                          <div className="flex flex-col gap-2">
                            <Button size="sm" onClick={() => openConfirm(r, "approved")} disabled={processing === r.id} className="gap-1 w-full">
                              {processing === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                              Approve
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => openConfirm(r, "rejected")} disabled={processing === r.id} className="gap-1 w-full">
                              <XCircle className="h-3 w-3" /> Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
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
                    totalItems={filteredRequests.length}
                    pageSize={pageSize}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deposits">
          <Card>
            <CardContent className="pt-6">
              {depositsLoading ? (
                <TableSkeleton rows={4} columns={6} />
              ) : filteredDeposits.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No pending fund deposits</p>
              ) : (
                <>
                  {/* Mobile card view */}
                  <div className="flex flex-col gap-3 md:hidden">
                    {paginatedDeposits.map((t) => (
                      <div key={t.id} className="rounded-xl border p-4 space-y-3 bg-card">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{t.client_name}</span>
                          <span className="font-mono font-semibold">${Number(t.amount).toFixed(2)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {t.creator_name && ` · by ${t.creator_name}`}
                        </div>
                        {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                        <div className="flex flex-col gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleDepositAction(t.id, "completed")}
                            disabled={processing === t.id}
                            className="gap-1 w-full"
                          >
                            {processing === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDepositAction(t.id, "rejected")}
                            disabled={processing === t.id}
                            className="gap-1 w-full"
                          >
                            <XCircle className="h-3 w-3" /> Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead className="hidden sm:table-cell">Submitted By</TableHead>
                          <TableHead className="hidden md:table-cell">Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedDeposits.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="whitespace-nowrap">{new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                            <TableCell className="font-medium">{t.client_name}</TableCell>
                            <TableCell className="hidden sm:table-cell">{t.creator_name}</TableCell>
                            <TableCell className="hidden md:table-cell">{t.description || "—"}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">${Number(t.amount).toFixed(2)}</TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleDepositAction(t.id, "completed")}
                                  disabled={processing === t.id}
                                  className="gap-1"
                                >
                                  {processing === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDepositAction(t.id, "rejected")}
                                  disabled={processing === t.id}
                                  className="gap-1"
                                >
                                  <XCircle className="h-3 w-3" /> Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <TablePagination
                    totalItems={filteredDeposits.length}
                    pageSize={depositPageSize}
                    currentPage={depositPage}
                    onPageChange={setDepositPage}
                    onPageSizeChange={(s) => { setDepositPageSize(s); setDepositPage(1); }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirmation Modal */}
      <Dialog open={confirmModal.open} onOpenChange={(open) => !open && setConfirmModal({ open: false, request: null, action: "approved" })}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md max-h-[85dvh] overflow-hidden p-0 flex flex-col">
          <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6 pb-2">
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

          <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4">
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
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground">Platform</span>
                  {confirmModal.action === "approved" ? (
                    <Select value={overriddenPlatform} onValueChange={(val) => {
                      setOverriddenPlatform(val);
                      const matchingRate = rateOptions.find(o => o.key === val);
                      if (matchingRate) setSelectedRateKey(matchingRate.key);
                    }}>
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="meta">Meta</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="google">Google</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
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
                  )}
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
                {(confirmModal.request as any)?.proof_image_url && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1">Payment Proof</p>
                    <a
                      href={(confirmModal.request as any).proof_image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        src={(confirmModal.request as any).proof_image_url}
                        alt="Payment proof"
                        className="h-32 w-auto rounded-lg border object-cover hover:opacity-80 transition-opacity cursor-zoom-in"
                      />
                    </a>
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
                                {overriddenPlatform && opt.key === overriddenPlatform && (
                                   <span className="ml-1.5 text-xs text-primary font-medium">(matches platform)</span>
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
          </div>

          <DialogFooter className="sticky bottom-0 z-10 border-t bg-background px-4 py-3 sm:px-6">
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