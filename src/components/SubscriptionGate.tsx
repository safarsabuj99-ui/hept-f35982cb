import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { compressImage } from "@/lib/compressImage";
import {
  Clock, AlertTriangle, XCircle, Crown, Check, Loader2,
  Upload, CreditCard, Sparkles, ArrowRight, LogOut, Phone,
} from "lucide-react";

interface SubscriptionGateProps {
  orgId: string;
  orgStatus: string;
  suspensionReason: string | null;
  onSignOut: () => void;
}

interface PlanData {
  id: string; name: string; key: string;
  price_bdt_monthly: number; price_bdt_yearly: number;
  max_clients: number; max_ad_accounts: number; max_managers: number;
  is_popular: boolean; features: any;
}

type PaymentStep = "select_plan" | "choose_method" | "manual_upload" | "gateway_redirect" | "submitted";

export function SubscriptionGate({ orgId, orgStatus, suspensionReason, onSignOut }: SubscriptionGateProps) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<PaymentStep>("select_plan");
  const [selectedPlan, setSelectedPlan] = useState<PlanData | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [paymentMethod, setPaymentMethod] = useState("bkash");
  const [txnRef, setTxnRef] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isCancelled = orgStatus === "cancelled";
  const isTrialExpired = orgStatus === "suspended" && suspensionReason?.toLowerCase().includes("trial");
  const isOverdue = orgStatus === "suspended" && !isTrialExpired;

  useEffect(() => {
    supabase.from("platform_plans").select("*").eq("is_active", true).order("sort_order")
      .then(({ data }) => { setPlans((data as any[]) ?? []); setLoading(false); });
  }, []);

  const getAmount = () => {
    if (!selectedPlan) return 0;
    return billingCycle === "yearly" ? selectedPlan.price_bdt_yearly : selectedPlan.price_bdt_monthly;
  };

  const handleManualSubmit = async () => {
    if (!selectedPlan || !user) return;
    setSubmitting(true);
    try {
      let proofUrl: string | null = null;
      if (proofFile) {
        const compressed = await compressImage(proofFile);
        const ext = proofFile.name.split(".").pop() || "jpg";
        const path = `payment-proofs/${orgId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("payment-proofs").upload(path, compressed);
        if (!upErr) {
          const { data: urlData } = supabase.storage.from("payment-proofs").getPublicUrl(path);
          proofUrl = urlData.publicUrl;
        }
      }

      // Create subscription payment record
      await supabase.from("subscription_payments").insert({
        org_id: orgId,
        amount_bdt: getAmount(),
        payment_method: paymentMethod,
        transaction_reference: txnRef || null,
        proof_image_url: proofUrl,
        status: "pending",
      });

      // Update org to pending_payment
      await supabase.from("organizations").update({
        status: "pending_payment",
        status_changed_at: new Date().toISOString(),
      }).eq("id", orgId);

      // Create or update subscription
      const periodStart = new Date().toISOString().slice(0, 10);
      const periodEnd = new Date(Date.now() + (billingCycle === "yearly" ? 365 : 30) * 86400000).toISOString().slice(0, 10);
      const planKey = selectedPlan.key as "starter" | "growth" | "agency_pro";

      const { data: existingSub } = await supabase.from("organization_subscriptions")
        .select("id").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1).single();

      if (existingSub) {
        await supabase.from("organization_subscriptions").update({
          plan: planKey,
          billing_cycle: billingCycle,
          amount_bdt: getAmount(),
          payment_status: "pending",
          current_period_start: periodStart,
          current_period_end: periodEnd,
          updated_at: new Date().toISOString(),
        }).eq("id", existingSub.id);
      } else {
        await (supabase.from("organization_subscriptions").insert as any)({
          org_id: orgId,
          plan: planKey,
          billing_cycle: billingCycle,
          amount_bdt: getAmount(),
          payment_status: "pending",
          current_period_start: periodStart,
          current_period_end: periodEnd,
        });
      }

      // Notify platform owner
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Payment Proof Submitted 💳",
        body: `Payment proof for ${selectedPlan.name} (${billingCycle}) has been submitted. Awaiting approval.`,
        type: "system",
        priority: "normal",
        link: "/admin/subscription",
      });

      setStep("submitted");
      toast.success("Payment proof submitted! Awaiting approval.");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit payment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGatewayPay = async () => {
    if (!selectedPlan) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("payment-gateway", {
        body: {
          action: "initiate",
          org_id: orgId,
          amount_bdt: getAmount(),
          plan_key: selectedPlan.key,
          billing_cycle: billingCycle,
          success_url: `${window.location.origin}/payment-success`,
          fail_url: `${window.location.origin}/payment-failed`,
          cancel_url: `${window.location.origin}/login`,
        },
      });
      if (error) throw error;
      if (data?.gateway_url) {
        window.location.href = data.gateway_url;
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (err: any) {
      toast.error(err.message || "Gateway initialization failed");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Icon & messaging ---
  const icon = isCancelled
    ? <XCircle className="h-10 w-10 text-destructive" />
    : isTrialExpired
    ? <Clock className="h-10 w-10 text-amber-500" />
    : <AlertTriangle className="h-10 w-10 text-orange-500" />;

  const title = isCancelled
    ? "Account Cancelled"
    : isTrialExpired
    ? "Your Trial Has Ended"
    : "Subscription Overdue";

  const subtitle = isCancelled
    ? "Your account has been cancelled. Please contact support to reactivate."
    : isTrialExpired
    ? "Upgrade to a plan to continue using all features."
    : "Your subscription payment is overdue. Renew now to restore access.";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-3xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center">
            {icon}
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground max-w-md mx-auto">{subtitle}</p>
        </div>

        {/* Cancelled — no payment flow */}
        {isCancelled && (
          <div className="text-center space-y-4">
            <Card className="max-w-md mx-auto">
              <CardContent className="pt-6 space-y-3">
                <Phone className="h-6 w-6 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Contact our support team to discuss reactivation options.
                </p>
              </CardContent>
            </Card>
            <Button variant="outline" onClick={onSignOut}><LogOut className="h-4 w-4 mr-2" />Sign Out</Button>
          </div>
        )}

        {/* Submitted state */}
        {!isCancelled && step === "submitted" && (
          <div className="text-center space-y-4">
            <Card className="max-w-md mx-auto">
              <CardContent className="pt-6 space-y-3">
                <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
                  <Clock className="h-8 w-8 text-amber-500" />
                </div>
                <h3 className="font-semibold">Payment Under Review</h3>
                <p className="text-sm text-muted-foreground">
                  Your payment proof has been submitted. You'll get access once approved.
                </p>
                <Badge variant="secondary">Verification in progress</Badge>
              </CardContent>
            </Card>
            <Button variant="outline" onClick={onSignOut}><LogOut className="h-4 w-4 mr-2" />Sign Out</Button>
          </div>
        )}

        {/* Step 1: Plan Selection */}
        {!isCancelled && step === "select_plan" && (
          <>
            <div className="flex justify-center gap-2 mb-4">
              <Button
                variant={billingCycle === "monthly" ? "default" : "outline"}
                size="sm"
                onClick={() => setBillingCycle("monthly")}
              >Monthly</Button>
              <Button
                variant={billingCycle === "yearly" ? "default" : "outline"}
                size="sm"
                onClick={() => setBillingCycle("yearly")}
              >
                Yearly <Badge variant="secondary" className="ml-1 text-xs">Save 17%</Badge>
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const price = billingCycle === "yearly" ? plan.price_bdt_yearly : plan.price_bdt_monthly;
                return (
                  <Card
                    key={plan.id}
                    className={`cursor-pointer transition-all hover:shadow-lg relative ${
                      selectedPlan?.id === plan.id ? "ring-2 ring-primary" : ""
                    } ${plan.is_popular ? "border-primary" : ""}`}
                    onClick={() => setSelectedPlan(plan)}
                  >
                    {plan.is_popular && (
                      <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 gap-1">
                        <Sparkles className="h-3 w-3" /> Popular
                      </Badge>
                    )}
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Crown className="h-4 w-4 text-primary" />
                        {plan.name}
                      </CardTitle>
                      <CardDescription>
                        <span className="text-2xl font-bold text-foreground">৳{price.toLocaleString()}</span>
                        <span className="text-muted-foreground">/{billingCycle === "yearly" ? "yr" : "mo"}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2"><Check className="h-3 w-3 text-primary" />{plan.max_clients} Clients</div>
                      <div className="flex items-center gap-2"><Check className="h-3 w-3 text-primary" />{plan.max_ad_accounts} Ad Accounts</div>
                      <div className="flex items-center gap-2"><Check className="h-3 w-3 text-primary" />{plan.max_managers} Managers</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <Button variant="outline" onClick={onSignOut}><LogOut className="h-4 w-4 mr-2" />Sign Out</Button>
              <Button
                disabled={!selectedPlan}
                onClick={() => setStep("choose_method")}
              >
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </>
        )}

        {/* Step 2: Payment Method */}
        {!isCancelled && step === "choose_method" && selectedPlan && (
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-lg">Choose Payment Method</CardTitle>
              <CardDescription>
                {selectedPlan.name} — ৳{getAmount().toLocaleString()}/{billingCycle === "yearly" ? "yr" : "mo"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => setStep("manual_upload")}
              >
                <Upload className="h-5 w-5 mr-3 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Manual Payment</div>
                  <div className="text-xs text-muted-foreground">bKash, Nagad, or Bank Transfer</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => handleGatewayPay()}
                disabled={submitting}
              >
                <CreditCard className="h-5 w-5 mr-3 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Pay Online</div>
                  <div className="text-xs text-muted-foreground">SSLCommerz (Card, Mobile Banking)</div>
                </div>
                {submitting && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
              </Button>

              <Separator />
              <Button variant="ghost" size="sm" onClick={() => setStep("select_plan")}>
                ← Change Plan
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Manual Payment Upload */}
        {!isCancelled && step === "manual_upload" && selectedPlan && (
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-lg">Submit Payment Proof</CardTitle>
              <CardDescription>
                Send ৳{getAmount().toLocaleString()} and upload the proof below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bkash">bKash</SelectItem>
                    <SelectItem value="nagad">Nagad</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="rocket">Rocket</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Transaction Reference</Label>
                <Input
                  placeholder="TXN ID or Reference Number"
                  value={txnRef}
                  onChange={(e) => setTxnRef(e.target.value)}
                />
              </div>
              <div>
                <Label>Payment Proof (Screenshot)</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                />
              </div>

              <Separator />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("choose_method")}>← Back</Button>
                <Button
                  className="flex-1"
                  disabled={submitting || !txnRef}
                  onClick={handleManualSubmit}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Submit Payment
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
