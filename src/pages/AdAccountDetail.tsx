import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Loader2, Settings2, Users, TrendingUp, ShieldAlert, X, UserPlus, Bell, CheckCheck, RefreshCw, DollarSign, CalendarDays, CreditCard, Pencil, Check } from "lucide-react";
import { ClientDateFilter, type ClientDateRange, type ClientDatePreset } from "@/components/ClientDateFilter";
import { format, differenceInDays } from "date-fns";

const CURRENCIES = [
  { value: "USD", label: "USD" },
  { value: "BDT", label: "BDT" },
];

interface ClientProfile {
  user_id: string;
  full_name: string;
}

export default function AdAccountDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [account, setAccount] = useState<any>(null);

  // Editable fields
  const [accountName, setAccountName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [accountLimit, setAccountLimit] = useState("");
  const [billingType, setBillingType] = useState("prepaid");
  const [thresholdLimit, setThresholdLimit] = useState("");
  const [nextBillingDate, setNextBillingDate] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Related data
  const [integrationName, setIntegrationName] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [spendData, setSpendData] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  // Client assignment form
  const [newClient, setNewClient] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  // Spend filter
  const [spendPreset, setSpendPreset] = useState<ClientDatePreset>("today");

  // Inline edit state for billing
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [editingBillingDate, setEditingBillingDate] = useState(false);
  const [editThresholdVal, setEditThresholdVal] = useState("");
  const [editBillingDateVal, setEditBillingDateVal] = useState("");
  const [savingInline, setSavingInline] = useState(false);

  useEffect(() => {
    if (accountId) loadAll();
  }, [accountId]);

  async function loadAll() {
    setLoading(true);
    const [acctRes, assignRes, rolesRes, profilesRes, notifRes] = await Promise.all([
      (supabase.from("ad_accounts" as any) as any).select("*").eq("id", accountId).single(),
      (supabase.from("ad_account_clients" as any) as any).select("*").eq("ad_account_id", accountId),
      supabase.from("user_roles").select("user_id").eq("role", "client"),
      supabase.from("profiles").select("user_id, full_name"),
      (supabase.from("billing_notifications" as any) as any).select("*").eq("ad_account_id", accountId).order("created_at", { ascending: false }).limit(50),
    ]);

    if (acctRes.data) {
      const a = acctRes.data;
      setAccount(a);
      setAccountName(a.account_name || "");
      setCurrency(a.account_currency);
      setAccountLimit(String(a.account_spending_limit ?? "250"));
      setBillingType(a.billing_type);
      setThresholdLimit(String(a.threshold_limit ?? "250"));
      setNextBillingDate(a.next_billing_date || "");
      setCardLast4(a.card_last_4 || "");
      setExchangeRate(a.exchange_rate ? String(a.exchange_rate) : "");
      setIsActive(a.is_active);

      // Load integration name
      if (a.api_integration_id) {
        const { data: intData } = await (supabase.from("api_integrations" as any) as any)
          .select("instance_name, platform")
          .eq("id", a.api_integration_id)
          .single();
        setIntegrationName(intData ? (intData.instance_name || `${intData.platform} integration`) : null);
      }

      // Load spend
      await loadSpend(null);
    }

    setAssignments(assignRes.data ?? []);
    const clientIds = new Set(rolesRes.data?.map((r: any) => r.user_id) ?? []);
    setClients((profilesRes.data ?? []).filter((p: any) => clientIds.has(p.user_id)));
    setNotifications(notifRes.data ?? []);
    setLoading(false);
  }

  async function loadSpend(range: ClientDateRange | null) {
    let query = (supabase.from("daily_ad_spend" as any) as any)
      .select("*")
      .eq("ad_account_id", accountId)
      .order("date", { ascending: false })
      .limit(500);
    if (range) {
      query = query.gte("date", format(range.from, "yyyy-MM-dd")).lte("date", format(range.to, "yyyy-MM-dd"));
    }
    const { data } = await query;
    setSpendData(data ?? []);
  }

  async function handleSpendDateChange(range: ClientDateRange | null, preset: ClientDatePreset) {
    setSpendPreset(preset);
    await loadSpend(range);
  }

  async function handleSave() {
    if (!accountId) return;
    setSaving(true);
    const payload: any = {
      account_name: accountName,
      account_currency: currency,
      account_spending_limit: accountLimit ? Number(accountLimit) : 250,
      billing_type: billingType,
      is_active: isActive,
      card_last_4: cardLast4 || null,
      exchange_rate: currency === "BDT" && exchangeRate ? Number(exchangeRate) : null,
    };
    if (billingType === "threshold_postpaid") {
      payload.threshold_limit = thresholdLimit ? Number(thresholdLimit) : 250;
      payload.next_billing_date = nextBillingDate || null;
    }
    const { error } = await (supabase.from("ad_accounts" as any) as any).update(payload).eq("id", accountId);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Account updated." });
      loadAll();
    }
  }

  async function handleSyncBilling() {
    if (!accountId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-billing-data", {
        body: { ad_account_id: accountId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Synced",
        description: data?.message || "Billing data synced from platform.",
      });
      await loadAll();
    } catch (err: any) {
      toast({ title: "Sync Failed", description: err.message, variant: "destructive" });
    }
    setSyncing(false);
  }

  async function addAssignment() {
    if (!newClient || !newKeyword.trim()) {
      toast({ title: "Required", description: "Select a client and enter a keyword", variant: "destructive" });
      return;
    }
    setAssignSaving(true);
    const { error } = await (supabase.from("ad_account_clients" as any) as any).insert({
      ad_account_id: accountId,
      client_id: newClient,
      mapping_keyword: newKeyword.trim(),
    });
    setAssignSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Assigned", description: "Client linked." });
      setNewClient("");
      setNewKeyword("");
      loadAll();
    }
  }

  async function removeAssignment(id: string) {
    await (supabase.from("ad_account_clients" as any) as any).delete().eq("id", id);
    loadAll();
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n: any) => !n.is_read).map((n: any) => n.id);
    if (!unreadIds.length) return;
    await (supabase.from("billing_notifications" as any) as any).update({ is_read: true }).in("id", unreadIds);
    loadAll();
  }

  const getClientName = (id: string) => clients.find((c) => c.user_id === id)?.full_name ?? "—";
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  async function saveInlineField(field: "threshold_limit" | "next_billing_date", value: string) {
    if (!accountId) return;
    setSavingInline(true);
    const payload: any = {};
    if (field === "threshold_limit") {
      payload.threshold_limit = value ? Number(value) : null;
    } else {
      payload.next_billing_date = value || null;
    }
    const { error } = await (supabase.from("ad_accounts" as any) as any).update(payload).eq("id", accountId);
    setSavingInline(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `${field === "threshold_limit" ? "Threshold" : "Billing date"} updated.` });
      setEditingThreshold(false);
      setEditingBillingDate(false);
      loadAll();
    }
  }

  const isThreshold = billingType === "threshold_postpaid";
  const usagePct = isThreshold && account?.threshold_limit > 0
    ? Math.round(((account?.current_threshold_spend ?? 0) / account.threshold_limit) * 100)
    : 0;
  const daysUntilBill = account?.next_billing_date
    ? differenceInDays(new Date(account.next_billing_date), new Date())
    : null;

  // Spend summary
  const totalSpend = spendData.reduce((s: number, r: any) => s + (r.final_billable_usd || 0), 0);
  const uniqueCampaigns = new Set(spendData.map((r: any) => r.campaign_name).filter(Boolean)).size;
  const avgDaily = spendData.length > 0 ? totalSpend / new Set(spendData.map((r: any) => r.date)).size : 0;

  const assignedClientIds = new Set(assignments.map((a: any) => a.client_id));
  const availableClients = clients.filter((c) => !assignedClientIds.has(c.user_id));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="space-y-4">
        <Link to="/admin/ad-accounts" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Ad Accounts
        </Link>
        <p className="text-muted-foreground">Account not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/ad-accounts" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to Ad Accounts
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{account.account_name || account.ad_account_id}</h1>
            <Badge variant="secondary" className="capitalize">{account.platform_name}</Badge>
            <Badge variant={account.is_active ? "default" : "outline"}>{account.is_active ? "Active" : "Inactive"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono mt-1">{account.ad_account_id}</p>
        </div>
      </div>

      <Tabs defaultValue="details" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="details" className="gap-1"><Settings2 className="h-3.5 w-3.5 hidden sm:inline" /> Details</TabsTrigger>
          <TabsTrigger value="clients" className="gap-1"><Users className="h-3.5 w-3.5 hidden sm:inline" /> Clients ({assignments.length})</TabsTrigger>
          <TabsTrigger value="spend" className="gap-1"><TrendingUp className="h-3.5 w-3.5 hidden sm:inline" /> Spend</TabsTrigger>
          <TabsTrigger value="billing" className="gap-1"><ShieldAlert className="h-3.5 w-3.5 hidden sm:inline" /> Billing</TabsTrigger>
        </TabsList>

        {/* DETAILS TAB */}
        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Account Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Account Name</Label>
                  <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Account name" />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Platform</Label>
                  <Input value={account.platform_name} disabled className="bg-muted capitalize" />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Ad Account ID</Label>
                  <Input value={account.ad_account_id} disabled className="bg-muted font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {currency === "BDT" && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Exchange Rate (BDT→USD)</Label>
                    <Input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="e.g. 120" min="1" step="0.01" />
                    <p className="text-xs text-muted-foreground">1 USD = X BDT. Used to convert BDT spend to USD.</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Account Spending Limit ($)</Label>
                  <Input type="number" value={accountLimit} onChange={(e) => setAccountLimit(e.target.value)} min="0" step="10" />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Billing Type</Label>
                  <Select value={billingType} onValueChange={setBillingType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prepaid">Prepaid</SelectItem>
                      <SelectItem value="threshold_postpaid">Threshold (Postpaid)</SelectItem>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isThreshold && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-xs uppercase tracking-wide">Threshold Limit ($)</Label>
                      <Input type="number" value={thresholdLimit} onChange={(e) => setThresholdLimit(e.target.value)} min="0" step="5" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-xs uppercase tracking-wide">Current Threshold Spend</Label>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-mono">{fmt(account.current_threshold_spend ?? 0)}</span>
                          <span className={`text-xs font-mono ${usagePct >= 80 ? "text-destructive" : usagePct >= 60 ? "text-yellow-500" : "text-emerald-500"}`}>{usagePct}%</span>
                        </div>
                        <Progress value={Math.min(usagePct, 100)} className="h-2" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-xs uppercase tracking-wide">Next Billing Date</Label>
                      <Input type="date" value={nextBillingDate} onChange={(e) => setNextBillingDate(e.target.value)} />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Card Last 4</Label>
                  <Input value={cardLast4} onChange={(e) => setCardLast4(e.target.value)} placeholder="4242" maxLength={4} />
                </div>
                {integrationName && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Linked Integration</Label>
                    <Input value={integrationName} disabled className="bg-muted" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Active</Label>
                  <div className="pt-1">
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={handleSyncBilling} disabled={syncing || !account?.api_integration_id} className="gap-2">
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Sync from Platform
                </Button>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CLIENTS TAB */}
        <TabsContent value="clients" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Assigned Clients</CardTitle>
              <CardDescription>Manage which clients are linked to this ad account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No clients assigned yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Mapping Keyword</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{getClientName(a.client_id)}</TableCell>
                        <TableCell><Badge variant="outline" className="font-mono text-xs">{a.mapping_keyword || "—"}</Badge></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeAssignment(a.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Add Client */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3 flex items-center gap-1.5"><UserPlus className="h-4 w-4" /> Add Client</p>
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="space-y-1.5 min-w-[180px]">
                    <Label className="text-xs">Client</Label>
                    <Select value={newClient} onValueChange={setNewClient}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select client" /></SelectTrigger>
                      <SelectContent>
                        {availableClients.map((c) => (
                          <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 min-w-[160px]">
                    <Label className="text-xs">Mapping Keyword</Label>
                    <Input className="h-9" placeholder="e.g. brandname" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} />
                  </div>
                  <Button size="sm" className="h-9" disabled={assignSaving || !newClient || !newKeyword.trim()} onClick={addAssignment}>
                    {assignSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    Assign
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SPEND TAB */}
        <TabsContent value="spend" className="space-y-4">
          <ClientDateFilter onRangeChange={handleSpendDateChange} activePreset={spendPreset} />

          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground uppercase">Total Spend</p><p className="text-2xl font-semibold mt-1">{fmt(totalSpend)}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground uppercase">Avg Daily</p><p className="text-2xl font-semibold mt-1">{fmt(avgDaily)}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground uppercase">Campaigns</p><p className="text-2xl font-semibold mt-1">{uniqueCampaigns}</p></CardContent></Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              {spendData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No spend data for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Raw Spend</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Billable USD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {spendData.map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm">{s.date}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{s.campaign_name || "—"}</TableCell>
                          <TableCell className="font-mono text-sm">{Number(s.raw_spend_amount).toFixed(2)}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{s.raw_currency}</Badge></TableCell>
                          <TableCell className="font-mono text-sm font-medium">{fmt(s.final_billable_usd)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* BILLING HEALTH TAB */}
        <TabsContent value="billing" className="space-y-4">
          {/* Outstanding Balance Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-muted-foreground font-medium">Outstanding balance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold tracking-tight">
                {fmt(account.current_threshold_spend ?? 0)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {(account.current_threshold_spend ?? 0) === 0
                  ? "No payment due at this time."
                  : "Payment pending"}
              </p>
            </CardContent>
          </Card>

          {/* You'll pay when — shown for all billing types */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">You'll pay when</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Threshold amount */}
                <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
                  <DollarSign className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">Your balance reaches</p>
                    {editingThreshold ? (
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="number"
                          className="h-8 w-28"
                          value={editThresholdVal}
                          onChange={(e) => setEditThresholdVal(e.target.value)}
                          placeholder="250"
                          min="0"
                          step="5"
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={savingInline} onClick={() => saveInlineField("threshold_limit", editThresholdVal)}>
                          <Check className="h-4 w-4 text-primary" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingThreshold(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-lg font-semibold">
                          {account.threshold_limit ? fmt(account.threshold_limit) : "—"}
                        </p>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-60 hover:opacity-100" onClick={() => { setEditThresholdVal(String(account.threshold_limit ?? "")); setEditingThreshold(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    {!editingThreshold && account.threshold_limit && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Set manually</p>
                    )}
                  </div>
                </div>
                {/* Next billing date */}
                <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
                  <CalendarDays className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">And on this date</p>
                    {editingBillingDate ? (
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="date"
                          className="h-8 w-40"
                          value={editBillingDateVal}
                          onChange={(e) => setEditBillingDateVal(e.target.value)}
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={savingInline} onClick={() => saveInlineField("next_billing_date", editBillingDateVal)}>
                          <Check className="h-4 w-4 text-primary" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingBillingDate(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-lg font-semibold">
                          {account.next_billing_date
                            ? format(new Date(account.next_billing_date), "MMM d, yyyy")
                            : "—"}
                        </p>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-60 hover:opacity-100" onClick={() => { setEditBillingDateVal(account.next_billing_date || ""); setEditingBillingDate(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    {!editingBillingDate && daysUntilBill !== null && (
                      <p className={`text-xs mt-0.5 ${daysUntilBill <= 2 ? "text-destructive" : "text-muted-foreground"}`}>
                        {daysUntilBill === 0 ? "Today" : daysUntilBill === 1 ? "Tomorrow" : `${daysUntilBill} days away`}
                      </p>
                    )}
                    {!editingBillingDate && account.next_billing_date && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Set manually</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* You'll pay using — payment method */}
          {account.card_last_4 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">You'll pay using</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30">
                  <CreditCard className="h-5 w-5 text-primary shrink-0" />
                  <p className="text-sm font-medium">{account.card_last_4}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Account Spending Limit — for prepaid or if limit is set */}
          {(!isThreshold || account.account_spending_limit) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Account Spending Limit</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
                  <DollarSign className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Spending limit</p>
                    <p className="text-lg font-semibold mt-0.5">
                      {account.account_spending_limit ? fmt(account.account_spending_limit) : "No limit set"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notifications */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" /> Billing Notifications</CardTitle>
                {notifications.some((n: any) => !n.is_read) && (
                  <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={markAllRead}>
                    <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No billing notifications.</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {notifications.map((n: any) => (
                    <div key={n.id} className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${n.is_read ? "opacity-60" : ""}`}>
                      <Badge variant={n.priority === "high" ? "destructive" : "outline"} className="text-[10px] mt-0.5 shrink-0">{n.priority}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs uppercase text-muted-foreground">{n.alert_type}</p>
                        <p>{n.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{format(new Date(n.created_at), "MMM d, yyyy h:mm a")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
