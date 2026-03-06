import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Monitor, Download, X, UserPlus, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { differenceInDays } from "date-fns";
import { TablePagination } from "@/components/TablePagination";
import { TableSkeleton } from "@/components/ui/premium-skeletons";

const PLATFORMS = [
  { value: "meta", label: "Meta" },
  { value: "tiktok", label: "TikTok" },
  { value: "google", label: "Google" },
];

const CURRENCIES = [
  { value: "USD", label: "USD" },
  { value: "BDT", label: "BDT" },
];

interface ClientProfile { user_id: string; full_name: string; }
interface Integration { id: string; platform: string; instance_name: string | null; is_active: boolean; }
interface AccountClientAssignment { id: string; ad_account_id: string; client_id: string; mapping_keyword: string; }

export default function AdAccounts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [assignments, setAssignments] = useState<AccountClientAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedIntegrations, setSelectedIntegrations] = useState<Set<string>>(new Set());
  const [importStatus, setImportStatus] = useState("");
  const [form, setForm] = useState({
    platform_name: "", ad_account_id: "", account_currency: "USD",
    daily_spending_limit: "250", billing_type: "prepaid", threshold_limit: "250",
    next_billing_date: "", card_last_4: "", exchange_rate: "",
  });
  // Add client popover state
  const [addClientPopover, setAddClientPopover] = useState<string | null>(null);
  const [newAssignClient, setNewAssignClient] = useState("");
  const [newAssignKeyword, setNewAssignKeyword] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchData = async () => {
    const [{ data: accs }, { data: roles }, { data: profiles }, { data: ints }, { data: assigns }] = await Promise.all([
      supabase.from("ad_accounts" as any).select("*").order("created_at", { ascending: false }) as any,
      supabase.from("user_roles").select("user_id").eq("role", "client"),
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("api_integrations").select("id, platform, instance_name, is_active").eq("is_active", true) as any,
      supabase.from("ad_account_clients" as any).select("*") as any,
    ]);
    setAccounts(accs ?? []);
    const clientIds = new Set(roles?.map((r: any) => r.user_id) ?? []);
    setClients((profiles ?? []).filter((p: any) => clientIds.has(p.user_id)));
    setAssignments(assigns ?? []);
    setIntegrations(ints ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.platform_name || !form.ad_account_id) return;
    setSaving(true);
    const payload: any = {
      platform_name: form.platform_name,
      ad_account_id: form.ad_account_id,
      account_currency: form.account_currency,
      daily_spending_limit: form.daily_spending_limit ? Number(form.daily_spending_limit) : 250,
      billing_type: form.billing_type,
    };
    if (form.billing_type === "threshold_postpaid") {
      payload.threshold_limit = form.threshold_limit ? Number(form.threshold_limit) : 250;
      if (form.next_billing_date) payload.next_billing_date = form.next_billing_date;
      if (form.card_last_4) payload.card_last_4 = form.card_last_4;
    }
    if (form.account_currency === "BDT" && form.exchange_rate) {
      payload.exchange_rate = Number(form.exchange_rate);
    }
    const { error } = await (supabase.from("ad_accounts" as any) as any).insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Created", description: "Ad account added" });
      setOpen(false);
      setForm({
        platform_name: "", ad_account_id: "", account_currency: "USD",
        daily_spending_limit: "250", billing_type: "prepaid", threshold_limit: "250",
        next_billing_date: "", card_last_4: "", exchange_rate: "",
      });
      fetchData();
    }
  };

  const handleAutoImport = async () => {
    if (selectedIntegrations.size === 0) {
      toast({ title: "Missing fields", description: "Select at least one integration", variant: "destructive" });
      return;
    }
    setImporting(true);
    setImportStatus("Fetching accounts from platforms...");
    try {
      const { data, error } = await supabase.functions.invoke("auto-import-accounts", {
        body: { integration_ids: Array.from(selectedIntegrations) },
      });
      if (error) throw error;
      const errMsg = data.errors?.length ? `\nWarnings: ${data.errors.join("; ")}` : "";
      toast({
        title: "Import Complete",
        description: `Created ${data.created} account(s), skipped ${data.skipped} duplicate(s)${errMsg}`,
      });
      setImportOpen(false);
      setSelectedIntegrations(new Set());
      fetchData();
    } catch (err: any) {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      setImportStatus("");
    }
  };

  const addClientAssignment = async (accountId: string) => {
    if (!newAssignClient || !newAssignKeyword.trim()) {
      toast({ title: "Required", description: "Select a client and enter a mapping keyword", variant: "destructive" });
      return;
    }
    setAssignSaving(true);
    const { error } = await (supabase.from("ad_account_clients" as any) as any).insert({
      ad_account_id: accountId,
      client_id: newAssignClient,
      mapping_keyword: newAssignKeyword.trim(),
    });
    setAssignSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message?.includes("duplicate") ? "Client already assigned to this account" : error.message, variant: "destructive" });
    } else {
      toast({ title: "Assigned", description: "Client linked with keyword" });
      setAddClientPopover(null);
      setNewAssignClient("");
      setNewAssignKeyword("");
      fetchData();
    }
  };

  const removeClientAssignment = async (assignmentId: string) => {
    const { error } = await (supabase.from("ad_account_clients" as any) as any).delete().eq("id", assignmentId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      fetchData();
    }
  };

  const toggleIntegration = (id: string) => {
    setSelectedIntegrations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllIntegrations = () => {
    if (selectedIntegrations.size === integrations.length) {
      setSelectedIntegrations(new Set());
    } else {
      setSelectedIntegrations(new Set(integrations.map((i) => i.id)));
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await (supabase.from("ad_accounts" as any) as any).update({ is_active: !current }).eq("id", id);
    fetchData();
  };

  const getClientName = (id: string) => clients.find((c) => c.user_id === id)?.full_name ?? "—";

  const getAccountAssignments = (accountId: string) =>
    assignments.filter((a) => a.ad_account_id === accountId);

  const getUsageColor = (pct: number) => {
    if (pct >= 80) return "text-destructive";
    if (pct >= 60) return "text-yellow-500";
    return "text-emerald-500";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ad Accounts</h1>
          <p className="text-muted-foreground">Manage platform ad accounts linked to clients</p>
        </div>
        <div className="flex gap-2">
          {/* Auto-Import Dialog */}
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={integrations.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Auto-Import
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Auto-Import Ad Accounts</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Active Integrations</Label>
                    <Button variant="ghost" size="sm" onClick={selectAllIntegrations} className="text-xs h-7">
                      {selectedIntegrations.size === integrations.length ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                  <div className="space-y-2 rounded-md border p-3">
                    {integrations.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2 text-center">No active integrations found</p>
                    ) : (
                      integrations.map((int) => (
                        <label key={int.id} className="flex items-center gap-3 py-1.5 px-1 rounded hover:bg-accent/50 cursor-pointer">
                          <Checkbox
                            checked={selectedIntegrations.has(int.id)}
                            onCheckedChange={() => toggleIntegration(int.id)}
                          />
                          <div className="flex items-center gap-2 flex-1">
                            <Badge variant="secondary" className="capitalize text-[10px]">{int.platform}</Badge>
                            <span className="text-sm">{int.instance_name || `${int.platform} integration`}</span>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>
                {selectedIntegrations.size > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedIntegrations.size} integration(s) selected — accounts will be fetched via API
                  </p>
                )}
                {importStatus && (
                  <p className="text-xs text-primary flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> {importStatus}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button onClick={handleAutoImport} disabled={importing || selectedIntegrations.size === 0} className="w-full">
                  {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Import Accounts
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add Account Dialog */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Add Account</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New Ad Account</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select value={form.platform_name} onValueChange={(v) => setForm({ ...form, platform_name: v })}>
                    <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                    <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Account ID</Label>
                  <Input value={form.ad_account_id} onChange={(e) => setForm({ ...form, ad_account_id: e.target.value })} placeholder="act_123456789" />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={form.account_currency} onValueChange={(v) => setForm({ ...form, account_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {form.account_currency === "BDT" && (
                  <div className="space-y-2">
                    <Label>Exchange Rate (BDT→USD)</Label>
                    <Input type="number" value={form.exchange_rate} onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })} placeholder="e.g. 120" min="1" step="0.01" />
                    <p className="text-xs text-muted-foreground">1 USD = X BDT. Used to convert BDT spend to USD in reports.</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Daily Spending Limit ($)</Label>
                  <Input type="number" value={form.daily_spending_limit} onChange={(e) => setForm({ ...form, daily_spending_limit: e.target.value })} placeholder="250" min="0" step="10" />
                </div>
                <div className="space-y-2">
                  <Label>Billing Type</Label>
                  <Select value={form.billing_type} onValueChange={(v) => setForm({ ...form, billing_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prepaid">Prepaid</SelectItem>
                      <SelectItem value="threshold_postpaid">Threshold (Postpaid)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.billing_type === "threshold_postpaid" && (
                  <>
                    <div className="space-y-2">
                      <Label>Threshold Limit ($)</Label>
                      <Input type="number" value={form.threshold_limit} onChange={(e) => setForm({ ...form, threshold_limit: e.target.value })} placeholder="250" min="0" step="5" />
                    </div>
                    <div className="space-y-2">
                      <Label>Next Billing Date</Label>
                      <Input type="date" value={form.next_billing_date} onChange={(e) => setForm({ ...form, next_billing_date: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Card Last 4</Label>
                      <Input value={form.card_last_4} onChange={(e) => setForm({ ...form, card_last_4: e.target.value })} placeholder="4242" maxLength={4} />
                    </div>
                  </>
                )}
                <Button onClick={handleCreate} className="w-full" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <TableSkeleton rows={5} columns={8} />
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Monitor className="h-10 w-10" />
              <p>No ad accounts yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Account ID</TableHead>
                    <TableHead className="min-w-[200px]">Clients & Keywords</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Daily Limit</TableHead>
                    <TableHead>Billing</TableHead>
                    <TableHead>Threshold</TableHead>
                    <TableHead>Next Bill</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((a: any) => {
                    const isThreshold = a.billing_type === "threshold_postpaid";
                    const usagePct = isThreshold && a.threshold_limit > 0
                      ? Math.round((a.current_threshold_spend / a.threshold_limit) * 100)
                      : 0;
                    const daysUntilBill = a.next_billing_date
                      ? differenceInDays(new Date(a.next_billing_date), new Date())
                      : null;
                    const accountAssignments = getAccountAssignments(a.id);
                    const assignedClientIds = new Set(accountAssignments.map((aa) => aa.client_id));
                    const availableClients = clients.filter((c) => !assignedClientIds.has(c.user_id));

                    return (
                      <TableRow key={a.id}>
                        <TableCell><Badge variant="secondary" className="capitalize">{a.platform_name}</Badge></TableCell>
                        <TableCell>
                          <button onClick={() => navigate(`/admin/ad-accounts/${a.id}`)} className="font-medium text-sm text-primary hover:underline flex items-center gap-1">
                            {a.account_name || a.ad_account_id}
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{a.ad_account_id}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {accountAssignments.map((assign) => (
                              <Badge key={assign.id} variant="outline" className="flex items-center gap-1 pr-1 text-[11px]">
                                <span className="font-medium">{getClientName(assign.client_id)}</span>
                                {assign.mapping_keyword && (
                                  <span className="text-muted-foreground">({assign.mapping_keyword})</span>
                                )}
                                <button
                                  onClick={() => removeClientAssignment(assign.id)}
                                  className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                            <Popover
                              open={addClientPopover === a.id}
                              onOpenChange={(open) => {
                                setAddClientPopover(open ? a.id : null);
                                if (!open) { setNewAssignClient(""); setNewAssignKeyword(""); }
                              }}
                            >
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={availableClients.length === 0}>
                                  <UserPlus className="h-3.5 w-3.5" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 space-y-3" align="start">
                                <p className="text-sm font-medium">Add Client</p>
                                <div className="space-y-2">
                                  <Label className="text-xs">Client</Label>
                                  <Select value={newAssignClient} onValueChange={setNewAssignClient}>
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Select client" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableClients.map((c) => (
                                        <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs">Mapping Keyword</Label>
                                  <Input
                                    className="h-8 text-xs"
                                    placeholder="e.g. brandname"
                                    value={newAssignKeyword}
                                    onChange={(e) => setNewAssignKeyword(e.target.value)}
                                  />
                                  <p className="text-[10px] text-muted-foreground">Campaigns containing this keyword will be mapped to this client</p>
                                </div>
                                <Button
                                  size="sm"
                                  className="w-full h-8 text-xs"
                                  disabled={assignSaving || !newAssignClient || !newAssignKeyword.trim()}
                                  onClick={() => addClientAssignment(a.id)}
                                >
                                  {assignSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                                  Assign
                                </Button>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant={a.account_currency === "BDT" ? "outline" : "default"}>{a.account_currency}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">${a.daily_spending_limit ?? 250}</TableCell>
                        <TableCell>
                          <Badge variant={isThreshold ? "destructive" : "secondary"} className="text-[10px]">
                            {isThreshold ? "Threshold" : "Prepaid"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isThreshold ? (
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <div className="relative h-2 w-16 overflow-hidden rounded-full bg-secondary">
                                <div
                                  className={`h-full transition-all ${usagePct >= 80 ? "bg-destructive" : usagePct >= 60 ? "bg-yellow-500" : "bg-emerald-500"}`}
                                  style={{ width: `${Math.min(usagePct, 100)}%` }}
                                />
                              </div>
                              <span className={`text-xs font-mono ${getUsageColor(usagePct)}`}>
                                {usagePct}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {daysUntilBill !== null && daysUntilBill >= 0 ? (
                            <Badge variant={daysUntilBill <= 2 ? "destructive" : "outline"} className="text-[10px]">
                              {daysUntilBill === 0 ? "Today" : daysUntilBill === 1 ? "Tomorrow" : `${daysUntilBill}d`}
                            </Badge>
                          ) : a.next_billing_date ? (
                            <span className="text-xs text-muted-foreground">{a.next_billing_date}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell><Switch checked={a.is_active} onCheckedChange={() => toggleActive(a.id, a.is_active)} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <TablePagination totalItems={accounts.length} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
