import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Crown, Eye, EyeOff, ImageIcon, Loader2, Upload, Users, Monitor, UserCheck } from "lucide-react";

interface Plan {
  id: string;
  key: string;
  name: string;
  price_bdt_monthly: number;
  price_bdt_yearly: number;
  max_clients: number;
  max_ad_accounts: number;
  max_managers: number;
  features: any;
  is_popular: boolean;
  sort_order: number;
}

const PAYMENT_METHODS = [
  { value: "bkash", label: "bKash", number: "01XXXXXXXXX", color: "bg-pink-500" },
  { value: "nagad", label: "Nagad", number: "01XXXXXXXXX", color: "bg-orange-500" },
  { value: "bank_transfer", label: "Bank Transfer", number: "Account details will be provided", color: "bg-blue-500" },
];

const STEPS_WITH_PAYMENT = ["Select Plan", "Account Details", "Payment", "Confirmation"];
const STEPS_TRIAL = ["Select Plan", "Account Details", "Confirmation"];

export default function Signup() {
  const [step, setStep] = useState(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState({ agency_name: "", full_name: "", email: "", password: "", confirm_password: "" });
  const [paymentMethod, setPaymentMethod] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [trialMode, setTrialMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref") || "";

  const steps = trialMode ? STEPS_TRIAL : STEPS_WITH_PAYMENT;
  const paymentStepIndex = trialMode ? -1 : 2;
  const confirmationStepIndex = trialMode ? 2 : 3;

  useEffect(() => {
    Promise.all([
      supabase.from("platform_plans").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("settings").select("key, value").eq("key", "trial_on_self_signup").maybeSingle(),
    ]).then(([plansRes, settingRes]) => {
      setPlans((plansRes.data as any[]) ?? []);
      if (settingRes.data && (settingRes.data as any).value === "true") {
        setTrialMode(true);
      }
      setLoadingPlans(false);
    });
  }, []);

  const price = (plan: Plan) => billingCycle === "yearly" ? plan.price_bdt_yearly : plan.price_bdt_monthly;
  const monthlySaving = (plan: Plan) => plan.price_bdt_monthly * 12 - plan.price_bdt_yearly;

  const validateStep1 = () => {
    if (!selectedPlan) { toast({ title: "Please select a plan", variant: "destructive" }); return false; }
    return true;
  };

  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (!form.agency_name.trim()) e.agency_name = "Agency name is required";
    if (!form.full_name.trim()) e.full_name = "Full name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email address";
    if (!form.password) e.password = "Password is required";
    else if (form.password.length < 6) e.password = "Minimum 6 characters";
    if (form.password !== form.confirm_password) e.confirm_password = "Passwords don't match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = () => {
    const e: Record<string, string> = {};
    if (!paymentMethod) e.payment_method = "Select a payment method";
    if (!transactionRef.trim()) e.transaction_ref = "Transaction reference is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const nextStep = () => {
    if (step === 0 && !validateStep1()) return;
    if (step === 1 && !validateStep2()) {
      return;
    }
    if (step === 1 && trialMode) { handleSubmit(); return; }
    if (step === paymentStepIndex) { handleSubmit(); return; }
    setStep(step + 1);
    setErrors({});
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: "File too large (max 5MB)", variant: "destructive" }); return; }
    setProofFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setProofPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!trialMode && !validateStep3()) return;
    if (!selectedPlan) return;
    setSubmitting(true);

    try {
      let proofUrl: string | null = null;

      // Upload proof image if provided
      if (proofFile) {
        const ext = proofFile.name.split(".").pop() || "jpg";
        const path = `signup/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("subscription-proofs").upload(path, proofFile);
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("subscription-proofs").getPublicUrl(path);
          proofUrl = urlData.publicUrl;
        }
      }

      // Call the self-signup edge function
      const { data, error } = await supabase.functions.invoke("self-signup", {
        body: {
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          agency_name: form.agency_name.trim(),
          plan_key: selectedPlan.key,
          billing_cycle: billingCycle,
          payment_method: paymentMethod,
          transaction_reference: transactionRef.trim(),
          proof_image_url: proofUrl,
          ref_code: refCode || undefined,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setStep(3);
    } catch (err: any) {
      toast({ title: "Signup failed", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-black text-sm">H</div>
            HEPT
          </Link>
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">Already have an account? <span className="text-primary font-medium">Login</span></Link>
        </div>
      </div>

      {/* Progress */}
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-4">
        <div className="flex items-center justify-between mb-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-sm hidden sm:inline ${i <= step ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s}</span>
              {i < steps.length - 1 && <div className={`h-px w-8 sm:w-16 ${i < step ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-16">
        {/* Step 1: Choose Plan */}
        {step === 0 && (
          <div>
            <h1 className="text-2xl font-bold text-center mb-2">Choose Your Plan</h1>
            <p className="text-center text-muted-foreground mb-6">Select the plan that fits your agency size</p>

            {/* Billing toggle */}
            <div className="flex items-center justify-center gap-3 mb-8">
              <button onClick={() => setBillingCycle("monthly")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${billingCycle === "monthly" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>Monthly</button>
              <button onClick={() => setBillingCycle("yearly")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${billingCycle === "yearly" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                Yearly <Badge variant="secondary" className="ml-1 text-[10px]">Save up to 20%</Badge>
              </button>
            </div>

            {loadingPlans ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="grid md:grid-cols-3 gap-4">
                {plans.map((plan) => (
                  <Card
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={`cursor-pointer transition-all relative ${
                      selectedPlan?.id === plan.id
                        ? "ring-2 ring-primary border-primary shadow-lg shadow-primary/10"
                        : "hover:border-primary/50 hover:shadow-md"
                    }`}
                  >
                    {plan.is_popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground gap-1"><Crown className="h-3 w-3" />Most Popular</Badge>
                      </div>
                    )}
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <div className="mt-2">
                        <span className="text-3xl font-black">৳{price(plan).toLocaleString()}</span>
                        <span className="text-muted-foreground text-sm">/{billingCycle === "yearly" ? "year" : "month"}</span>
                      </div>
                      {billingCycle === "yearly" && monthlySaving(plan) > 0 && (
                        <p className="text-xs text-emerald-500 font-medium">Save ৳{monthlySaving(plan).toLocaleString()}/year</p>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-muted rounded-lg p-2">
                          <Users className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs font-semibold">{plan.max_clients}</p>
                          <p className="text-[10px] text-muted-foreground">Clients</p>
                        </div>
                        <div className="bg-muted rounded-lg p-2">
                          <Monitor className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs font-semibold">{plan.max_ad_accounts}</p>
                          <p className="text-[10px] text-muted-foreground">Ad Accts</p>
                        </div>
                        <div className="bg-muted rounded-lg p-2">
                          <UserCheck className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs font-semibold">{plan.max_managers}</p>
                          <p className="text-[10px] text-muted-foreground">Managers</p>
                        </div>
                      </div>
                      {Array.isArray(plan.features) && (
                        <ul className="space-y-1">
                          {(plan.features as string[]).slice(0, 5).map((f, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <CheckCircle2 className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      )}
                      {selectedPlan?.id === plan.id && (
                        <div className="flex items-center justify-center gap-1 text-primary text-sm font-medium pt-1">
                          <CheckCircle2 className="h-4 w-4" /> Selected
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Account Details */}
        {step === 1 && (
          <div className="max-w-lg mx-auto">
            <h1 className="text-2xl font-bold text-center mb-2">Create Your Account</h1>
            <p className="text-center text-muted-foreground mb-8">Set up your agency admin account</p>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Agency Name *</Label>
                  <Input value={form.agency_name} onChange={(e) => setForm({ ...form, agency_name: e.target.value })} placeholder="Your Agency Name" />
                  {errors.agency_name && <p className="text-xs text-destructive">{errors.agency_name}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Your Full Name *</Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="John Doe" />
                  {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Email Address *</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="admin@agency.com" />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Password *</Label>
                  <div className="relative">
                    <Input type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password *</Label>
                  <Input type="password" value={form.confirm_password} onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} placeholder="Re-enter password" />
                  {errors.confirm_password && <p className="text-xs text-destructive">{errors.confirm_password}</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Payment */}
        {step === 2 && selectedPlan && (
          <div className="max-w-lg mx-auto">
            <h1 className="text-2xl font-bold text-center mb-2">Submit Payment</h1>
            <p className="text-center text-muted-foreground mb-8">
              Pay <span className="font-bold text-foreground">৳{price(selectedPlan).toLocaleString()}</span> for {selectedPlan.name} ({billingCycle})
            </p>

            <Card>
              <CardContent className="pt-6 space-y-5">
                {/* Payment method selection */}
                <div className="space-y-2">
                  <Label>Payment Method *</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m.value}
                        onClick={() => setPaymentMethod(m.value)}
                        className={`p-3 rounded-lg border text-center transition-all ${
                          paymentMethod === m.value
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:border-primary/50"
                        }`}
                      >
                        <div className={`h-6 w-6 rounded-full mx-auto mb-1 ${m.color}`} />
                        <p className="text-xs font-medium">{m.label}</p>
                      </button>
                    ))}
                  </div>
                  {errors.payment_method && <p className="text-xs text-destructive">{errors.payment_method}</p>}
                </div>

                {/* Payment instruction */}
                {paymentMethod && (
                  <div className="bg-muted/50 rounded-lg p-3 text-sm">
                    <p className="font-medium mb-1">Send ৳{price(selectedPlan).toLocaleString()} to:</p>
                    <p className="text-muted-foreground">{PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.number}</p>
                    <p className="text-xs text-muted-foreground mt-1">Use "Personal" payment type. Include your agency name as reference.</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Transaction Reference / TrxID *</Label>
                  <Input value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} placeholder="e.g. TrxID: 8A7K2P9M3L" />
                  {errors.transaction_ref && <p className="text-xs text-destructive">{errors.transaction_ref}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Payment Proof (Optional)</Label>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  {proofPreview ? (
                    <div className="relative">
                      <img src={proofPreview} alt="Proof" className="w-full h-48 object-contain rounded-lg border bg-muted" />
                      <button onClick={() => { setProofFile(null); setProofPreview(null); }} className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 text-xs">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                      <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Click to upload screenshot</p>
                      <p className="text-xs text-muted-foreground">Max 5MB · JPG, PNG</p>
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 3 && (
          <div className="max-w-lg mx-auto text-center py-12">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-3">Signup Submitted! 🎉</h1>
            <p className="text-muted-foreground mb-6">
              Your agency account has been created and your payment is under review.
              You'll receive access once the payment is verified by our team.
            </p>
            <Card className="text-left mb-8">
              <CardContent className="pt-6 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Agency</span><span className="font-medium">{form.agency_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span className="font-medium">{selectedPlan?.name} ({billingCycle})</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium">৳{selectedPlan ? price(selectedPlan).toLocaleString() : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium">{form.email}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="secondary">Under Review</Badge></div>
              </CardContent>
            </Card>
            <Button asChild>
              <Link to="/login">Go to Login</Link>
            </Button>
          </div>
        )}

        {/* Navigation buttons */}
        {step < 3 && (
          <div className="flex items-center justify-between mt-8 max-w-lg mx-auto">
            <Button variant="ghost" onClick={() => { setStep(Math.max(0, step - 1)); setErrors({}); }} disabled={step === 0 || submitting}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button onClick={nextStep} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {step === 2 ? "Submit & Sign Up" : "Continue"}
              {step < 2 && <ArrowRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
