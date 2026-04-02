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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Monitor, Download, ExternalLink, Search, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { differenceInDays } from "date-fns";
import { TablePagination } from "@/components/TablePagination";
import { TableSkeleton } from "@/components/ui/premium-skeletons";
import { PullToRefresh } from "@/components/PullToRefresh";

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
    account_spending_limit: "250", billing_type: "prepaid", threshold_limit: "250",
    next_billing_date: "", card_last_4: "", exchange_rate: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"active" | "inactive">("active");
  const { toast } = useToast();
  const navigate = useNavigate();

  // Bulk delete state
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const fetchData = async () => {
    const [{ data: accs }, { data: roles }, { data: profiles }, { data: ints }, { data: assigns }] = await Promise.all([
      supabase.from("ad_accounts" as any).select("*").order("created_at", { ascending: false }) as any,
      supabase.from("user_roles").select("user_id").eq("role", "client"),
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("api_integrations").select("id, platform, instance_name, is_active").eq("is_active", true) as any,
      supabase.from("ad_account_clients" as any).select("*") as any,
    ]);
    const sorted = (accs ?? []).sort((a: any, b: any) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setAccounts(sorted);
    const clientIds = new Set(roles?.map((r: any) => r.user_id) ?? []);
    setClients((profiles ?? []).filter((p: any) => clientIds.has(p.user_id)));
    setAssignments(assigns ?? []);
    setIntegrations(ints ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel("ad-accounts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_accounts" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_account_clients" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Clear selection on search/filter/page change
  useEffect(() => { setSelectedAccounts(new Set()); }, [searchQuery, currentPage, pageSize]);

  const handleCreate = async () => {
    if (!form.platform_name || !form.ad_account_id) return;
    setSaving(true);
    const payload: any = {
      platform_name: form.platform_name,
      ad_account_id: form.ad_account_id,
      account_currency: form.account_currency,
      account_spending_limit: form.account_spending_limit ? Number(form.account_spending_limit) : 250,
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
        account_spending_limit: "250", billing_type: "prepaid", threshold_limit: "250",
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

  // Bulk selection helpers
  const toggleAccountSelection = (id: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    const pageIds = paginatedAccounts.map((a: any) => a.id);
    const allSelected = pageIds.every((id: string) => selectedAccounts.has(id));
    if (allSelected) {
      setSelectedAccounts((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id: string) => next.delete(id));
        return next;
      });
    } else {
      setSelectedAccounts((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id: string) => next.add(id));
        return next;
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedAccounts.size === 0) return;
    setBulkDeleting(true);
    setConfirmDeleteOpen(false);

    const ids = Array.from(selectedAccounts);
    let deleted = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        // Cascade delete related data in order
        await (supabase.from("ad_account_clients" as any) as any).delete().eq("ad_account_id", id);
        await (supabase.from("billing_notifications" as any) as any).delete().eq("ad_account_id", id);
        await (supabase.from("campaign_performance" as any) as any).delete().eq("ad_account_id", id);
        await (supabase.from("daily_ad_spend" as any) as any).delete().eq("ad_account_id", id);
        await (supabase.from("campaign_mappings" as any) as any).delete().eq("ad_account_id", id);
        await (supabase.from("campaigns" as any) as any).delete().eq("ad_account_id", id);
        const { error } = await (supabase.from("ad_accounts" as any) as any).delete().eq("id", id);
        if (error) throw error;
        deleted++;
      } catch (err: any) {
        console.error(`Failed to delete account ${id}:`, err);
        failed++;
      }
    }

    setBulkDeleting(false);
    setSelectedAccounts(new Set());

    toast({
      title: "Bulk Delete Complete",
      description: `Deleted ${deleted} account(s)${failed > 0 ? `, ${failed} failed` : ""}`,
      variant: failed > 0 ? "destructive" : undefined,
    });
    fetchData();
  };

  const filteredAccounts = accounts.filter((a: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const integration = integrations.find((i: any) => i.id === a.api_integration_id);
    const instanceName = (integration?.instance_name || "").toLowerCase();
    return (a.account_name || "").toLowerCase().includes(q)
      || (a.ad_account_id || "").toLowerCase().includes(q)
      || (a.platform_name || "").toLowerCase().includes(q)
      || instanceName.includes(q);
  });

  const paginatedAccounts = filteredAccounts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allPageSelected = paginatedAccounts.length > 0 && paginatedAccounts.every((a: any) => selectedAccounts.has(a.id));
  const somePageSelected = paginatedAccounts.some((a: any) => selectedAccounts.has(a.id));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header — stacks on mobile */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Ad Accounts</h1>
          <p className="text-sm text-muted-foreground">Manage platform ad accounts linked to clients</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {/* Auto-Import Dialog */}
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={integrations.length === 0} className="flex-1 sm:flex-none h-11 sm:h-10">
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
              <Button className="flex-1 sm:flex-none h-11 sm:h-10"><Plus className="mr-2 h-4 w-4" /> Add Account</Button>
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
                  <Label>Account Spending Limit ($)</Label>
                  <Input type="number" value={form.account_spending_limit} onChange={(e) => setForm({ ...form, account_spending_limit: e.target.value })} placeholder="250" min="0" step="10" />
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by account name, ID, platform, or instance name..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          className="pl-9 w-full sm:max-w-md"
        />
      </div>

      {/* Content */}
      {loading ? (
        <Card><CardContent className="pt-6"><TableSkeleton rows={5} columns={8} /></CardContent></Card>
      ) : filteredAccounts.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Monitor className="h-10 w-10" />
              <p>No ad accounts yet</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile Card View */}
          <PullToRefresh onRefresh={fetchData}>
          <div className="flex flex-col gap-3 md:hidden">
            {paginatedAccounts.map((a: any) => {
              const isThreshold = a.billing_type === "threshold_postpaid";
              const usagePct = isThreshold && a.threshold_limit > 0
                ? Math.round((a.current_threshold_spend / a.threshold_limit) * 100)
                : 0;
              const daysUntilBill = a.next_billing_date
                ? differenceInDays(new Date(a.next_billing_date), new Date())
                : null;
              const accountAssignments = getAccountAssignments(a.id);
              const integration = a.api_integration_id ? integrations.find(i => i.id === a.api_integration_id) : null;

              return (
                <div key={a.id} className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                  {/* Top row: Checkbox + Platform + Active toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedAccounts.has(a.id)}
                        onCheckedChange={() => toggleAccountSelection(a.id)}
                      />
                      <Badge variant="secondary" className="capitalize text-xs">{a.platform_name}</Badge>
                      {integration && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                          {integration.instance_name || `${integration.platform}`}
                        </span>
                      )}
                    </div>
                    <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a.id, a.is_active)} />
                  </div>

                  {/* Account name + ID */}
                  <div>
                    <button
                      onClick={() => navigate(`/admin/ad-accounts/${a.id}`)}
                      className="font-semibold text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      {a.account_name || a.ad_account_id}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </button>
                    <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{a.ad_account_id}</p>
                  </div>

                  {/* 2-column info grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Clients</span>
                      <p className="font-medium mt-0.5">
                        {accountAssignments.length > 0
                          ? `${accountAssignments.length} client${accountAssignments.length !== 1 ? "s" : ""}`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Currency</span>
                      <p className="mt-0.5">
                        <Badge variant={a.account_currency === "BDT" ? "outline" : "default"} className="text-[10px]">{a.account_currency}</Badge>
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Billing</span>
                      <p className="mt-0.5">
                        <Badge variant={isThreshold ? "destructive" : "secondary"} className="text-[10px]">
                          {isThreshold ? "Threshold" : "Prepaid"}
                        </Badge>
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Next Bill</span>
                      <p className="font-medium mt-0.5">
                        {daysUntilBill !== null && daysUntilBill >= 0 ? (
                          <Badge variant={daysUntilBill <= 2 ? "destructive" : "outline"} className="text-[10px]">
                            {daysUntilBill === 0 ? "Today" : daysUntilBill === 1 ? "Tomorrow" : `${daysUntilBill}d`}
                          </Badge>
                        ) : a.next_billing_date ? (
                          <span className="text-muted-foreground">{a.next_billing_date}</span>
                        ) : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Balance / threshold progress */}
                  {isThreshold && a.threshold_limit > 0 && (
                    <div className="pt-1">
                      <div className="flex justify-between text-[11px] font-mono mb-1">
                        <span className={usagePct >= 80 ? "text-destructive" : usagePct >= 60 ? "text-warning" : "text-success"}>
                          ${(a.current_threshold_spend ?? 0).toFixed(2)}
                        </span>
                        <span className="text-muted-foreground">/ ${a.threshold_limit}</span>
                      </div>
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full transition-all ${usagePct >= 80 ? "bg-destructive" : usagePct >= 60 ? "bg-warning" : "bg-success"}`}
                          style={{ width: `${Math.min(usagePct, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </PullToRefresh>

          {/* Desktop Table View */}
          <Card className="hidden md:block">
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allPageSelected}
                          onCheckedChange={toggleSelectAllOnPage}
                          aria-label="Select all on page"
                          {...(somePageSelected && !allPageSelected ? { "data-state": "indeterminate" } : {})}
                        />
                      </TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Account ID</TableHead>
                      <TableHead>Clients</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead>Next Bill</TableHead>
                      <TableHead>Active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedAccounts.map((a: any) => {
                      const isThreshold = a.billing_type === "threshold_postpaid";
                      const usagePct = isThreshold && a.threshold_limit > 0
                        ? Math.round((a.current_threshold_spend / a.threshold_limit) * 100)
                        : 0;
                      const daysUntilBill = a.next_billing_date
                        ? differenceInDays(new Date(a.next_billing_date), new Date())
                        : null;
                      const accountAssignments = getAccountAssignments(a.id);

                      return (
                        <TableRow key={a.id} className={selectedAccounts.has(a.id) ? "bg-muted/50" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={selectedAccounts.has(a.id)}
                              onCheckedChange={() => toggleAccountSelection(a.id)}
                              aria-label={`Select ${a.account_name || a.ad_account_id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="capitalize">{a.platform_name}</Badge>
                            {a.api_integration_id && (() => {
                              const int = integrations.find(i => i.id === a.api_integration_id);
                              return int ? (
                                <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[120px]">
                                  {int.instance_name || `${int.platform} integration`}
                                </p>
                              ) : null;
                            })()}
                          </TableCell>
                          <TableCell>
                            <button onClick={() => navigate(`/admin/ad-accounts/${a.id}`)} className="font-medium text-sm text-primary hover:underline flex items-center gap-1">
                              {a.account_name || a.ad_account_id}
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{a.ad_account_id}</TableCell>
                          <TableCell className="text-sm">
                            {accountAssignments.length > 0 ? (
                              <Badge variant="secondary">{accountAssignments.length} client{accountAssignments.length !== 1 ? "s" : ""}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell><Badge variant={a.account_currency === "BDT" ? "outline" : "default"}>{a.account_currency}</Badge></TableCell>
                          <TableCell>
                            {isThreshold && a.threshold_limit > 0 ? (
                              <div className="min-w-[140px]">
                                <div className="flex justify-between text-[11px] font-mono mb-1">
                                  <span className={usagePct >= 80 ? "text-destructive" : usagePct >= 60 ? "text-warning" : "text-success"}>
                                    ${(a.current_threshold_spend ?? 0).toFixed(2)}
                                  </span>
                                  <span className="text-muted-foreground">/ ${a.threshold_limit}</span>
                                </div>
                                <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                                  <div
                                    className={`h-full transition-all ${usagePct >= 80 ? "bg-destructive" : usagePct >= 60 ? "bg-warning" : "bg-success"}`}
                                    style={{ width: `${Math.min(usagePct, 100)}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={isThreshold ? "destructive" : "secondary"} className="text-[10px]">
                              {isThreshold ? "Threshold" : "Prepaid"}
                            </Badge>
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
              </div>
            </CardContent>
          </Card>

          {/* Pagination for both views */}
          <TablePagination totalItems={filteredAccounts.length} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
        </>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedAccounts.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border bg-card px-5 py-3 shadow-lg">
          <span className="text-sm font-medium">
            {selectedAccounts.size} account{selectedAccounts.size !== 1 ? "s" : ""} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={bulkDeleting}
          >
            {bulkDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Delete Selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedAccounts(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {selectedAccounts.size} ad account{selectedAccounts.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected ad account{selectedAccounts.size !== 1 ? "s" : ""} and all related data including client assignments, campaigns, spend history, and billing notifications. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete {selectedAccounts.size} Account{selectedAccounts.size !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
