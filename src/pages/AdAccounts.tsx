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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Monitor, Download } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { differenceInDays } from "date-fns";

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

export default function AdAccounts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedIntegrations, setSelectedIntegrations] = useState<Set<string>>(new Set());
  const [importStatus, setImportStatus] = useState("");
  const [form, setForm] = useState({
    client_id: "", platform_name: "", ad_account_id: "", account_currency: "USD",
    daily_spending_limit: "250", billing_type: "prepaid", threshold_limit: "250",
    next_billing_date: "", card_last_4: "",
  });
  const { toast } = useToast();

  const fetchData = async () => {
    const [{ data: accs }, { data: roles }, { data: profiles }, { data: ints }] = await Promise.all([
      supabase.from("ad_accounts" as any).select("*").order("created_at", { ascending: false }) as any,
      supabase.from("user_roles").select("user_id").eq("role", "client"),
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("api_integrations").select("id, platform, instance_name, is_active").eq("is_active", true) as any,
    ]);
    setAccounts(accs ?? []);
    const clientIds = new Set(roles?.map((r: any) => r.user_id) ?? []);
    setClients((profiles ?? []).filter((p: any) => clientIds.has(p.user_id)));
    setIntegrations(ints ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.client_id || !form.platform_name || !form.ad_account_id) return;
    setSaving(true);
    const payload: any = {
      client_id: form.client_id,
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
    const { error } = await (supabase.from("ad_accounts" as any) as any).insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Created", description: "Ad account added" });
      setOpen(false);
      setForm({
        client_id: "", platform_name: "", ad_account_id: "", account_currency: "USD",
        daily_spending_limit: "250", billing_type: "prepaid", threshold_limit: "250",
        next_billing_date: "", card_last_4: "",
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
        body: {
          integration_ids: Array.from(selectedIntegrations),
        },
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

  const updateAccountClient = async (accountId: string, clientId: string | null) => {
    const { error } = await (supabase.from("ad_accounts" as any) as any).update({ client_id: clientId || null }).eq("id", accountId);
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

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Add Account</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New Ad Account</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent>{clients.map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
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
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
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
                    <TableHead>Client</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Daily Limit</TableHead>
                    <TableHead>Billing</TableHead>
                    <TableHead>Threshold</TableHead>
                    <TableHead>Next Bill</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a: any) => {
                    const isThreshold = a.billing_type === "threshold_postpaid";
                    const usagePct = isThreshold && a.threshold_limit > 0
                      ? Math.round((a.current_threshold_spend / a.threshold_limit) * 100)
                      : 0;
                    const daysUntilBill = a.next_billing_date
                      ? differenceInDays(new Date(a.next_billing_date), new Date())
                      : null;

                    return (
                      <TableRow key={a.id}>
                        <TableCell><Badge variant="secondary" className="capitalize">{a.platform_name}</Badge></TableCell>
                        <TableCell className="font-medium text-sm">{a.account_name || <span className="text-muted-foreground italic">—</span>}</TableCell>
                        <TableCell className="font-mono text-xs">{a.ad_account_id}</TableCell>
                        <TableCell>
                          <Select value={a.client_id || ""} onValueChange={(v) => updateAccountClient(a.id, v)}>
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue placeholder="Assign client" />
                            </SelectTrigger>
                            <SelectContent>
                              {clients.map((c) => (
                                <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
