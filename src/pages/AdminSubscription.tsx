import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { FEATURE_LABELS, type FeatureKey } from "@/hooks/useOrgFeatures";
import { compressImage } from "@/lib/compressImage";
import {
  CreditCard, Crown, Users, Monitor, UserCog, Check, X,
  CalendarDays, Receipt, AlertTriangle, Loader2, Upload,
  Clock, CheckCircle, XCircle, Wifi,
} from "lucide-react";

interface OrgData {
  id: string; name: string; plan: string; status: string;
  trial_ends_at: string | null; max_clients: number;
  max_ad_accounts: number; max_managers: number;
  allowed_features: Record<string, boolean>;
}

interface SubData {
  id: string; plan: string; billing_cycle: string; amount_bdt: number;
  payment_status: string; current_period_start: string; current_period_end: string;
}

interface InvoiceData {
  id: string; invoice_number: string; amount_bdt: number; status: string;
  period_start: string; period_end: string; due_date: string | null;
  payment_date: string | null;
}

interface PaymentRecord {
  id: string; amount_bdt: number; payment_method: string;
  transaction_reference: string | null; proof_image_url: string | null;
  status: string; admin_note: string | null; created_at: string;
  invoice_id: string | null;
}

function statusColor(s: string) {
  switch (s) {
    case "active": return "default";
    case "trial": return "secondary";
    case "suspended": return "destructive";
    default: return "outline";
  }
}

function paymentColor(s: string) {
  switch (s) {
    case "paid": return "default";
    case "pending": return "secondary";
    case "overdue": return "destructive";
    default: return "outline";
  }
}

function paymentStatusBadge(s: string) {
  const map: Record<string, { cls: string; icon: any; label: string }> = {
    pending: { cls: "bg-warning/15 text-warning border-warning/20", icon: Clock, label: "Pending Review" },
    approved: { cls: "bg-success/15 text-success border-success/20", icon: CheckCircle, label: "Approved" },
    completed: { cls: "bg-success/15 text-success border-success/20", icon: CheckCircle, label: "Completed" },
    rejected: { cls: "bg-destructive/15 text-destructive border-destructive/20", icon: XCircle, label: "Rejected" },
  };
  const info = map[s] || map.pending;
  return <Badge className={`${info.cls} gap-1`}><info.icon className="h-3 w-3" />{info.label}</Badge>;
}

function UsageGauge({ label, icon: Icon, used, max }: { label: string; icon: any; used: number; max: number }) {
  const pct = max > 0 ? Math.round((used / max) * 100) : 0;
  const color = pct >= 90 ? "text-destructive" : pct >= 70 ? "text-yellow-500" : "text-primary";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </div>
        <span className={color}>{used} / {max}</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}

export default function AdminSubscription() {
  const { session } = useAuth();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [sub, setSub] = useState<SubData | null>(null);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [counts, setCounts] = useState({ clients: 0, adAccounts: 0, managers: 0 });
  const [loading, setLoading] = useState(true);

  // Pay Now dialog
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<InvoiceData | null>(null);
  const [payMethod, setPayMethod] = useState("bKash");
  const [payRef, setPayRef] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;

    async function load() {
      setLoading(true);
      const { data: prof } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("user_id", session!.user.id)
        .single();
      const orgId = prof?.org_id;
      if (!orgId) { setLoading(false); return; }

      const [orgRes, subRes, invRes, clientRes, adRes, mgrRes, payRes] = await Promise.all([
        supabase.from("organizations").select("id,name,plan,status,trial_ends_at,max_clients,max_ad_accounts,max_managers,allowed_features").eq("id", orgId).single(),
        supabase.from("organization_subscriptions").select("id,plan,billing_cycle,amount_bdt,payment_status,current_period_start,current_period_end").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("platform_invoices").select("id,invoice_number,amount_bdt,status,period_start,period_end,due_date,payment_date").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20),
        supabase.from("profiles").select("user_id", { count: "exact", head: true }).eq("org_id", orgId).in("user_id", (await supabase.from("user_roles" as any).select("user_id").eq("role", "client")).data?.map((r: any) => r.user_id) || []),
        supabase.from("ad_accounts").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("is_active", true),
        supabase.from("profiles").select("user_id", { count: "exact", head: true }).eq("org_id", orgId).in("user_id", (await supabase.from("user_roles" as any).select("user_id").eq("role", "manager")).data?.map((r: any) => r.user_id) || []),
        supabase.from("subscription_payments").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(50),
      ]);

      if (orgRes.data) setOrg(orgRes.data as any);
      if (subRes.data) setSub(subRes.data as any);
      setInvoices((invRes.data || []) as any);
      setPayments((payRes.data || []) as any);
      setCounts({
        clients: clientRes.count || 0,
        adAccounts: adRes.count || 0,
        managers: mgrRes.count || 0,
      });
      setLoading(false);
    }
    load();
  }, [session?.user?.id]);

  const openPayDialog = (invoice?: InvoiceData) => {
    setPayingInvoice(invoice || null);
    setPayAmount(invoice ? String(invoice.amount_bdt) : sub ? String(sub.amount_bdt) : "");
    setPayMethod("bKash");
    setPayRef("");
    setProofFile(null);
    setPayDialogOpen(true);
  };

  const handleManualSubmit = async () => {
    if (!org || !session?.user?.id) return;
    if (!payRef.trim()) { toast.error("Please enter a transaction reference"); return; }
    if (!proofFile) { toast.error("Please upload payment proof"); return; }

    setSubmitting(true);
    try {
      // Upload proof image
      const compressed = await compressImage(proofFile);
      const fileName = `${org.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("subscription-proofs")
        .upload(fileName, compressed, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("subscription-proofs")
        .getPublicUrl(fileName);

      // Insert payment record
      const { error: insertError } = await supabase
        .from("subscription_payments")
        .insert({
          org_id: org.id,
          invoice_id: payingInvoice?.id || null,
          amount_bdt: Number(payAmount),
          payment_method: "manual",
          transaction_reference: payRef.trim(),
          proof_image_url: urlData.publicUrl,
          status: "pending",
        } as any);
      if (insertError) throw insertError;

      // Notify platform owner
      const { data: owners } = await supabase.from("user_roles" as any).select("user_id").eq("role", "platform_owner");
      for (const owner of (owners || [])) {
        await supabase.from("notifications").insert({
          user_id: (owner as any).user_id,
          title: "Payment Submitted for Review",
          body: `${org.name} submitted ৳${Number(payAmount).toLocaleString()} via ${payMethod}. Transaction ref: ${payRef.trim()}`,
          type: "system" as any,
          priority: "high",
          link: "/platform/billing",
        });
      }

      toast.success("Payment submitted! Awaiting admin verification.");
      setPayDialogOpen(false);

      // Refresh payments
      const { data: newPayments } = await supabase
        .from("subscription_payments")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setPayments((newPayments || []) as any);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit payment");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p>No organization found</p>
      </div>
    );
  }

  const features = (org.allowed_features || {}) as Record<string, boolean>;
  const needsRenewal = sub && (sub.payment_status === "pending" || sub.payment_status === "overdue");

  return (
    <div className="space-y-6">
      <PageHeader title="Plan & Billing" subtitle="View your subscription, usage, and invoices" />

      {/* Renewal Alert */}
      {needsRenewal && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Payment {sub.payment_status}</p>
              <p className="text-xs text-muted-foreground">
                Your subscription payment is {sub.payment_status}. Please submit a payment.
              </p>
            </div>
            <Button size="sm" onClick={() => openPayDialog()}>
              Pay Now
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Current Plan */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" />
                Current Plan
              </CardTitle>
              <Badge variant={statusColor(org.status)} className="capitalize">{org.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-2xl font-bold capitalize">{org.plan}</div>
            {org.trial_ends_at && (
              <p className="text-sm text-muted-foreground">
                Trial ends: {format(new Date(org.trial_ends_at), "MMM dd, yyyy")}
              </p>
            )}
            {sub && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Billing Cycle</p>
                    <p className="font-medium capitalize">{sub.billing_cycle}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Amount</p>
                    <p className="font-medium">৳{sub.amount_bdt.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Period</p>
                    <p className="font-medium">{format(new Date(sub.current_period_start), "MMM dd")} – {format(new Date(sub.current_period_end), "MMM dd, yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Payment</p>
                    <Badge variant={paymentColor(sub.payment_status)} className="capitalize">{sub.payment_status}</Badge>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Usage */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Resource Usage</CardTitle>
            <CardDescription>Current usage against your plan limits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <UsageGauge label="Clients" icon={Users} used={counts.clients} max={org.max_clients} />
            <UsageGauge label="Ad Accounts" icon={Monitor} used={counts.adAccounts} max={org.max_ad_accounts} />
            <UsageGauge label="Managers" icon={UserCog} used={counts.managers} max={org.max_managers} />
          </CardContent>
        </Card>
      </div>

      {/* Features */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Included Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => {
              const enabled = features[key] === true;
              return (
                <div key={key} className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${enabled ? "bg-accent/30 border-primary/20" : "opacity-50"}`}>
                  {enabled ? <Check className="h-4 w-4 text-primary shrink-0" /> : <X className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className={enabled ? "font-medium" : "text-muted-foreground"}>{FEATURE_LABELS[key]}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Invoices */}
      {invoices.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5 text-muted-foreground" />
              Invoice History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Invoice</th>
                    <th className="pb-2 pr-4">Period</th>
                    <th className="pb-2 pr-4">Amount</th>
                    <th className="pb-2 pr-4">Due</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium">{inv.invoice_number}</td>
                      <td className="py-2.5 pr-4">{format(new Date(inv.period_start), "MMM dd")} – {format(new Date(inv.period_end), "MMM dd, yy")}</td>
                      <td className="py-2.5 pr-4">৳{inv.amount_bdt.toLocaleString()}</td>
                      <td className="py-2.5 pr-4">{inv.due_date ? format(new Date(inv.due_date), "MMM dd, yy") : "—"}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={inv.status === "paid" ? "default" : inv.status === "sent" ? "secondary" : "outline"} className="capitalize text-xs">{inv.status}</Badge>
                      </td>
                      <td className="py-2.5">
                        {inv.status !== "paid" && inv.status !== "void" && (
                          <Button size="sm" variant="outline" onClick={() => openPayDialog(inv)} className="gap-1.5 text-xs">
                            <CreditCard className="h-3 w-3" /> Pay
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Submissions History */}
      {payments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              Payment Submissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Amount</th>
                    <th className="pb-2 pr-4">Method</th>
                    <th className="pb-2 pr-4">Reference</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4">{format(new Date(p.created_at), "MMM dd, yy")}</td>
                      <td className="py-2.5 pr-4 font-medium">৳{p.amount_bdt.toLocaleString()}</td>
                      <td className="py-2.5 pr-4 capitalize">{p.payment_method}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{p.transaction_reference || "—"}</td>
                      <td className="py-2.5 pr-4">{paymentStatusBadge(p.status)}</td>
                      <td className="py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{p.admin_note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pay Now Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={(o) => !o && setPayDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {payingInvoice ? `Pay Invoice ${payingInvoice.invoice_number}` : "Submit Payment"}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="manual">
            <TabsList className="w-full">
              <TabsTrigger value="manual" className="flex-1 gap-1.5">
                <Upload className="h-3.5 w-3.5" /> Manual Payment
              </TabsTrigger>
              <TabsTrigger value="gateway" className="flex-1 gap-1.5">
                <Wifi className="h-3.5 w-3.5" /> Online Payment
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="space-y-4 mt-4">
              <div>
                <Label>Amount (৳)</Label>
                <Input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="Enter amount"
                />
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bKash">bKash</SelectItem>
                    <SelectItem value="Nagad">Nagad</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Rocket">Rocket</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Transaction Reference / ID</Label>
                <Input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="e.g. TXN-123456789"
                />
              </div>
              <div>
                <Label>Payment Proof (Screenshot / Receipt)</Label>
                <div className="mt-1.5">
                  {proofFile ? (
                    <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm truncate flex-1">{proofFile.name}</span>
                      <Button variant="ghost" size="sm" onClick={() => setProofFile(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 cursor-pointer hover:border-primary/40 transition-colors">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to upload proof image</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  )}
                </div>
              </div>
              <Button
                onClick={handleManualSubmit}
                disabled={submitting || !payRef.trim() || !proofFile || !payAmount}
                className="w-full gap-2"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Submit for Verification
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Your payment will be reviewed and approved by the platform administrator.
              </p>
            </TabsContent>

            <TabsContent value="gateway" className="mt-4">
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                  <Wifi className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">Online Payment</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Automatic payment gateway integration is coming soon. Please use manual payment for now.
                </p>
                <Badge variant="outline" className="text-xs">Coming Soon</Badge>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
