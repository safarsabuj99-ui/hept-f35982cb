import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, LogIn, Users, Monitor, UserCheck, Clock, KeyRound, CreditCard, Check, X, Settings2, Save } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { ALL_FEATURE_KEYS, FEATURE_LABELS, type FeatureKey } from "@/hooks/useOrgFeatures";

interface UsageStats {
  clientsUsed: number;
  adAccountsUsed: number;
  managersUsed: number;
}

interface PlanOption {
  key: string;
  name: string;
  max_clients: number;
  max_ad_accounts: number;
  max_managers: number;
  price_bdt_monthly: number;
  price_bdt_yearly: number;
  feature_flags: Record<string, boolean>;
}

export default function AgencyDetail() {
  const { agencyId } = useParams<{ agencyId: string }>();
  const [org, setOrg] = useState<(Tables<"organizations"> & { suspension_reason?: string; notes?: string }) | null>(null);
  const [usage, setUsage] = useState<UsageStats>({ clientsUsed: 0, adAccountsUsed: 0, managersUsed: 0 });
  const [adminProfile, setAdminProfile] = useState<Tables<"profiles"> | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [subPayments, setSubPayments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suspendDialog, setSuspendDialog] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [featureOverrideOpen, setFeatureOverrideOpen] = useState(false);
  const [overrideFeatures, setOverrideFeatures] = useState<Record<string, boolean>>({});
  const [subEditing, setSubEditing] = useState(false);
  const [subForm, setSubForm] = useState<any>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!agencyId) return;
    const fetchData = async () => {
      const [{ data: orgData }, { data: profiles }, { data: adAccounts }, { data: invData }, { data: logs }, { data: subData }, { data: planData }, { data: spData }] = await Promise.all([
        supabase.from("organizations").select("*").eq("id", agencyId).single(),
        supabase.from("profiles").select("*").eq("org_id", agencyId),
        supabase.from("ad_accounts").select("id").eq("org_id", agencyId),
        supabase.from("platform_invoices" as any).select("*").eq("org_id", agencyId).order("created_at", { ascending: false }),
        supabase.from("audit_logs").select("*").eq("org_id", agencyId).order("created_at", { ascending: false }).limit(50),
        supabase.from("organization_subscriptions").select("*").eq("org_id", agencyId).order("created_at", { ascending: false }).limit(1),
        supabase.from("platform_plans").select("key, name, max_clients, max_ad_accounts, max_managers, price_bdt_monthly, price_bdt_yearly, feature_flags").eq("is_active", true).order("sort_order"),
        supabase.from("subscription_payments").select("*").eq("org_id", agencyId).order("created_at", { ascending: false }).limit(20),
      ]);

      setOrg(orgData as any);
      setSubscription(subData?.[0] ?? null);
      if (planData?.length) setPlans(planData as PlanOption[]);

      // --- Accurate usage counting via user_roles ---
      const profileUserIds = profiles?.map((p) => p.user_id) ?? [];
      let clientCount = 0;
      let managerCount = 0;

      if (profileUserIds.length > 0) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", profileUserIds);

        if (roles) {
          const orgUserIdSet = new Set(profileUserIds);
          clientCount = roles.filter((r) => r.role === "client" && orgUserIdSet.has(r.user_id)).length;
          managerCount = roles.filter((r) => r.role === "manager" && orgUserIdSet.has(r.user_id)).length;
        }
      }

      setUsage({
        clientsUsed: clientCount,
        adAccountsUsed: adAccounts?.length ?? 0,
        managersUsed: managerCount,
      });

      const admin = profiles?.find((p) => p.user_id === orgData?.owner_user_id);
      setAdminProfile(admin ?? null);
      setInvoices((invData as any[]) ?? []);
      setSubPayments((spData as any[]) ?? []);
      setAuditLogs(logs ?? []);
      setLoading(false);
    };
    fetchData();
  }, [agencyId]);

  const updateField = async (field: string, value: any) => {
    if (!agencyId) return;
    setSaving(true);
    const { error } = await supabase.from("organizations").update({ [field]: value } as any).eq("id", agencyId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { setOrg((prev) => prev ? { ...prev, [field]: value } : prev); toast({ title: "Updated" }); }
    setSaving(false);
  };

  const handlePlanChange = async (newPlan: string) => {
    if (!agencyId) return;
    setSaving(true);
    const planInfo = plans.find((p) => p.key === newPlan);

    const featureFlags = planInfo?.feature_flags && typeof planInfo.feature_flags === "object"
      ? planInfo.feature_flags : {};

    const updates: any = { plan: newPlan, allowed_features: featureFlags };
    if (planInfo) {
      updates.max_clients = planInfo.max_clients;
      updates.max_ad_accounts = planInfo.max_ad_accounts;
      updates.max_managers = planInfo.max_managers;
    }

    const { error } = await supabase.from("organizations").update(updates).eq("id", agencyId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setOrg((prev) => prev ? { ...prev, ...updates } : prev);

      if (subscription && planInfo) {
        const amount = subscription.billing_cycle === "yearly" ? planInfo.price_bdt_yearly : planInfo.price_bdt_monthly;
        await supabase
          .from("organization_subscriptions")
          .update({ plan: newPlan as any, amount_bdt: amount, updated_at: new Date().toISOString() })
          .eq("id", subscription.id);
        setSubscription((prev: any) => prev ? { ...prev, plan: newPlan, amount_bdt: amount } : prev);
      }

      toast({ title: "Plan updated", description: `Plan changed to ${planInfo?.name ?? newPlan}. Resource limits & features synced.` });
    }
    setSaving(false);
  };

  const handleSuspend = async () => {
    await updateField("status", "suspended");
    if (suspendReason) await updateField("suspension_reason" as any, suspendReason);
    setSuspendDialog(false);
    setSuspendReason("");
  };

  const handleLoginAs = () => {
    if (!org) return;
    sessionStorage.setItem("impersonate_org_id", org.id);
    sessionStorage.setItem("impersonate_org_name", org.name);
    window.open("/admin", "_blank");
  };

  // --- Subscription editor ---
  const startSubEdit = () => {
    if (!subscription) return;
    setSubForm({
      billing_cycle: subscription.billing_cycle || "monthly",
      payment_status: subscription.payment_status || "pending",
      current_period_start: subscription.current_period_start || "",
      current_period_end: subscription.current_period_end || "",
      amount_bdt: subscription.amount_bdt || 0,
      payment_method: subscription.payment_method || "",
      transaction_reference: subscription.transaction_reference || "",
    });
    setSubEditing(true);
  };

  const handleSubCycleChange = (cycle: string) => {
    const currentPlan = plans.find((p) => p.key === org?.plan);
    const newAmount = cycle === "yearly" ? currentPlan?.price_bdt_yearly : currentPlan?.price_bdt_monthly;
    setSubForm((prev: any) => ({ ...prev, billing_cycle: cycle, ...(newAmount !== undefined ? { amount_bdt: newAmount } : {}) }));
  };

  const saveSubscription = async () => {
    if (!subscription) return;
    setSaving(true);
    const { error } = await supabase
      .from("organization_subscriptions")
      .update({
        billing_cycle: subForm.billing_cycle,
        payment_status: subForm.payment_status,
        current_period_start: subForm.current_period_start,
        current_period_end: subForm.current_period_end,
        amount_bdt: Number(subForm.amount_bdt),
        payment_method: subForm.payment_method || null,
        transaction_reference: subForm.transaction_reference || null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", subscription.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setSubscription((prev: any) => ({ ...prev, ...subForm, amount_bdt: Number(subForm.amount_bdt) }));
      toast({ title: "Subscription updated" });
      setSubEditing(false);
    }
    setSaving(false);
  };

  // --- Feature override ---
  const openFeatureOverride = () => {
    const current = (org as any)?.allowed_features || {};
    const flags: Record<string, boolean> = {};
    ALL_FEATURE_KEYS.forEach((k) => { flags[k] = current[k] === true; });
    setOverrideFeatures(flags);
    setFeatureOverrideOpen(true);
  };

  const saveFeatureOverride = async () => {
    if (!agencyId) return;
    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({ allowed_features: overrideFeatures } as any)
      .eq("id", agencyId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setOrg((prev) => prev ? { ...prev, allowed_features: overrideFeatures as any } : prev);
      toast({ title: "Features updated" });
      setFeatureOverrideOpen(false);
    }
    setSaving(false);
  };

  const isCustomFeatures = () => {
    if (!org) return false;
    const planInfo = plans.find((p) => p.key === org.plan);
    if (!planInfo?.feature_flags) return false;
    const planFlags = planInfo.feature_flags as Record<string, boolean>;
    const orgFlags = (org as any).allowed_features || {};
    return ALL_FEATURE_KEYS.some((k) => (planFlags[k] === true) !== (orgFlags[k] === true));
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!org) return <p className="text-muted-foreground">Agency not found</p>;

  const statusColor: Record<string, string> = {
    active: "bg-success/10 text-success", trial: "bg-warning/10 text-warning",
    suspended: "bg-destructive/10 text-destructive", cancelled: "bg-muted text-muted-foreground",
  };

  const usagePct = (used: number, max: number) => max > 0 ? Math.round((used / max) * 100) : 0;
  const trialDays = org.trial_ends_at ? Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000)) : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate("/platform/agencies")} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{org.name}</h1>
          <p className="text-sm text-muted-foreground">/{org.slug}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={statusColor[org.status] ?? ""}>{org.status}</Badge>
          <Button variant="outline" size="sm" onClick={handleLoginAs} className="gap-2">
            <LogIn className="h-4 w-4" /> Login As Admin
          </Button>
        </div>
      </div>

      {trialDays !== null && org.status === "trial" && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="py-3 flex items-center gap-3">
            <Clock className="h-5 w-5 text-warning" />
            <p className="text-sm text-foreground"><strong>{trialDays}</strong> days left in trial{trialDays === 0 ? " — expired!" : ""}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="billing">Billing History</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Usage Meters */}
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Clients", used: usage.clientsUsed, max: org.max_clients, icon: Users },
              { label: "Ad Accounts", used: usage.adAccountsUsed, max: org.max_ad_accounts, icon: Monitor },
              { label: "Managers", used: usage.managersUsed, max: org.max_managers, icon: UserCheck },
            ].map((m) => (
              <Card key={m.label}>
                <CardHeader className="pb-2 flex flex-row items-center gap-2">
                  <m.icon className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">{m.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground font-medium">{m.used} / {m.max}</span>
                    <span className="text-muted-foreground">{usagePct(m.used, m.max)}%</span>
                  </div>
                  <Progress value={usagePct(m.used, m.max)} className={usagePct(m.used, m.max) > 90 ? "[&>div]:bg-destructive" : ""} />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Subscription Info — Editable */}
          {subscription && (
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Subscription</CardTitle>
                </div>
                {!subEditing && (
                  <Button variant="outline" size="sm" onClick={startSubEdit} className="gap-1.5">
                    <Settings2 className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {!subEditing ? (
                  <div className="grid gap-2 sm:grid-cols-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Amount</p>
                      <p className="font-medium">৳{subscription.amount_bdt?.toLocaleString()}/{subscription.billing_cycle === "yearly" ? "yr" : "mo"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Payment</p>
                      <Badge className={
                        subscription.payment_status === "paid" ? "bg-success/10 text-success" :
                        subscription.payment_status === "overdue" ? "bg-destructive/10 text-destructive" :
                        "bg-warning/10 text-warning"
                      }>{subscription.payment_status}</Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Period</p>
                      <p className="font-medium">{subscription.current_period_start} → {subscription.current_period_end}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Cycle</p>
                      <p className="font-medium capitalize">{subscription.billing_cycle}</p>
                    </div>
                    {subscription.payment_method && (
                      <div>
                        <p className="text-muted-foreground">Payment Method</p>
                        <p className="font-medium">{subscription.payment_method}</p>
                      </div>
                    )}
                    {subscription.transaction_reference && (
                      <div>
                        <p className="text-muted-foreground">Transaction Ref</p>
                        <p className="font-medium font-mono text-xs">{subscription.transaction_reference}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Billing Cycle</Label>
                        <Select value={subForm.billing_cycle} onValueChange={handleSubCycleChange}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="yearly">Yearly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Payment Status</Label>
                        <Select value={subForm.payment_status} onValueChange={(v) => setSubForm((p: any) => ({ ...p, payment_status: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="overdue">Overdue</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <Label>Amount (৳)</Label>
                        <Input type="number" value={subForm.amount_bdt} onChange={(e) => setSubForm((p: any) => ({ ...p, amount_bdt: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Period Start</Label>
                        <Input type="date" value={subForm.current_period_start} onChange={(e) => setSubForm((p: any) => ({ ...p, current_period_start: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Period End</Label>
                        <Input type="date" value={subForm.current_period_end} onChange={(e) => setSubForm((p: any) => ({ ...p, current_period_end: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Payment Method</Label>
                        <Input value={subForm.payment_method} onChange={(e) => setSubForm((p: any) => ({ ...p, payment_method: e.target.value }))} placeholder="bKash, Bank Transfer, etc." />
                      </div>
                      <div>
                        <Label>Transaction Reference</Label>
                        <Input value={subForm.transaction_reference} onChange={(e) => setSubForm((p: any) => ({ ...p, transaction_reference: e.target.value }))} placeholder="TXN-123456" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setSubEditing(false)}>Cancel</Button>
                      <Button onClick={saveSubscription} disabled={saving} className="gap-1.5">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Admin Contact */}
          {adminProfile && (
            <Card>
              <CardHeader><CardTitle className="text-base">Agency Admin</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-foreground font-medium">{adminProfile.full_name}</p>
                  <p className="text-sm text-muted-foreground">{adminProfile.email}</p>
                  {adminProfile.phone && <p className="text-sm text-muted-foreground">{adminProfile.phone}</p>}
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => toast({ title: "Password reset email sent (simulated)" })}>
                  <KeyRound className="h-4 w-4" /> Reset Password
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Enabled Features */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Plan Features</CardTitle>
                {isCustomFeatures() && <Badge variant="outline" className="text-xs">Custom</Badge>}
              </div>
              <Button variant="outline" size="sm" onClick={openFeatureOverride} className="gap-1.5">
                <Settings2 className="h-3.5 w-3.5" /> Override
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_FEATURE_KEYS.map((key) => {
                  const enabled = (org as any).allowed_features?.[key] === true;
                  return (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      {enabled ? (
                        <Check className="h-3.5 w-3.5 text-success shrink-0" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      )}
                      <span className={enabled ? "text-foreground" : "text-muted-foreground/50 line-through"}>
                        {FEATURE_LABELS[key]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Plan</CardTitle></CardHeader>
              <CardContent>
                <Select value={org.plan} onValueChange={handlePlanChange} disabled={saving}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plans.length > 0 ? plans.map((p) => (
                      <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>
                    )) : (
                      <>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="growth">Growth</SelectItem>
                        <SelectItem value="agency_pro">Agency Pro</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Status</CardTitle></CardHeader>
              <CardContent>
                <Select value={org.status} onValueChange={(v) => {
                  if (v === "suspended") { setSuspendDialog(true); return; }
                  updateField("status", v);
                }} disabled={saving}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                {(org as any).suspension_reason && org.status === "suspended" && (
                  <p className="text-xs text-destructive mt-2">Reason: {(org as any).suspension_reason}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid On</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                      <TableCell>৳{inv.amount_bdt?.toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{inv.period_start} → {inv.period_end}</TableCell>
                      <TableCell><Badge variant={inv.status === "paid" ? "default" : inv.status === "overdue" ? "destructive" : "secondary"}>{inv.status}</Badge></TableCell>
                      <TableCell>{inv.payment_date || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {invoices.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No invoices yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Payment Submissions */}
          {subPayments.length > 0 && (
            <Card className="mt-4">
              <CardHeader><CardTitle className="text-base">Payment Submissions</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead><TableHead>Proof</TableHead><TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subPayments.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{p.created_at?.slice(0, 10)}</TableCell>
                        <TableCell className="font-medium">৳{p.amount_bdt?.toLocaleString()}</TableCell>
                        <TableCell className="capitalize">{p.payment_method}</TableCell>
                        <TableCell className="font-mono text-xs">{p.transaction_reference || "—"}</TableCell>
                        <TableCell>
                          {p.proof_image_url ? (
                            <a href={p.proof_image_url} target="_blank" rel="noopener noreferrer" className="text-primary text-xs underline">View</a>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"} className="capitalize text-xs">{p.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="activity">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{log.action_type}</Badge></TableCell>
                      <TableCell className="text-sm">{log.description}</TableCell>
                    </TableRow>
                  ))}
                  {auditLogs.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No activity logs</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Resource Limits</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Max Clients</Label>
                  <Input type="number" defaultValue={org.max_clients} onBlur={(e) => updateField("max_clients", +e.target.value)} />
                </div>
                <div>
                  <Label>Max Ad Accounts</Label>
                  <Input type="number" defaultValue={org.max_ad_accounts} onBlur={(e) => updateField("max_ad_accounts", +e.target.value)} />
                </div>
                <div>
                  <Label>Max Managers</Label>
                  <Input type="number" defaultValue={org.max_managers} onBlur={(e) => updateField("max_managers", +e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
                defaultValue={(org as any).notes || ""}
                onBlur={(e) => updateField("notes" as any, e.target.value)}
                placeholder="Internal notes about this agency..."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Suspend Dialog */}
      <Dialog open={suspendDialog} onOpenChange={setSuspendDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Suspend Agency — {org.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason for suspension</Label>
              <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} placeholder="Payment overdue, policy violation, etc." />
            </div>
            <Button variant="destructive" onClick={handleSuspend} disabled={saving} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm Suspension
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Feature Override Dialog */}
      <Dialog open={featureOverrideOpen} onOpenChange={setFeatureOverrideOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Override Features — {org.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Toggle features for this agency independent of the plan defaults.</p>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {ALL_FEATURE_KEYS.map((key) => (
              <div key={key} className="flex items-center justify-between">
                <Label className="text-sm font-normal">{FEATURE_LABELS[key]}</Label>
                <Switch
                  checked={overrideFeatures[key] === true}
                  onCheckedChange={(checked) => setOverrideFeatures((prev) => ({ ...prev, [key]: checked }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeatureOverrideOpen(false)}>Cancel</Button>
            <Button onClick={saveFeatureOverride} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
