import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/PageHeader";
import {
  Loader2, Plus, Pencil, Star, Trash2, Check, X,
  Users, MonitorSmartphone, UserCog, Crown, Sparkles,
  Shield, BarChart3, Palette, MessageSquare, DollarSign,
  Zap, Globe, Headphones, Receipt, Landmark, RefreshCw
} from "lucide-react";
import { ALL_FEATURE_KEYS, FEATURE_LABELS, type FeatureKey } from "@/hooks/useOrgFeatures";

/* ─── Types ─── */
interface Plan {
  id: string;
  name: string;
  key: string;
  price_bdt_monthly: number;
  price_bdt_yearly: number;
  max_clients: number;
  max_ad_accounts: number;
  max_managers: number;
  features: string[];
  feature_flags: Record<string, boolean>;
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
}

const defaultFlags: Record<string, boolean> = Object.fromEntries(ALL_FEATURE_KEYS.map(k => [k, false]));

const emptyPlan: Omit<Plan, "id"> = {
  name: "", key: "", price_bdt_monthly: 0, price_bdt_yearly: 0,
  max_clients: 5, max_ad_accounts: 10, max_managers: 2,
  features: [], feature_flags: { ...defaultFlags },
  is_popular: false, is_active: true, sort_order: 0,
};

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  ad_guard: <Shield className="h-3.5 w-3.5" />,
  advanced_analytics: <BarChart3 className="h-3.5 w-3.5" />,
  api_access: <Globe className="h-3.5 w-3.5" />,
  white_label: <Palette className="h-3.5 w-3.5" />,
  campaign_requests: <MessageSquare className="h-3.5 w-3.5" />,
  multi_manager: <UserCog className="h-3.5 w-3.5" />,
  priority_support: <Headphones className="h-3.5 w-3.5" />,
  expense_tracking: <Receipt className="h-3.5 w-3.5" />,
  cash_flow: <Landmark className="h-3.5 w-3.5" />,
  usd_inventory: <DollarSign className="h-3.5 w-3.5" />,
  custom_exchange_rate: <RefreshCw className="h-3.5 w-3.5" />,
  client_notices: <MessageSquare className="h-3.5 w-3.5" />,
};

/* ─── Component ─── */
export default function PlatformPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<Plan, "id">>(emptyPlan);
  const [saving, setSaving] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [subscriberCounts, setSubscriberCounts] = useState<Record<string, number>>({});
  const [trialDays, setTrialDays] = useState(14);
  const [gracePeriodDays, setGracePeriodDays] = useState(7);
  const [trialOnSelfSignup, setTrialOnSelfSignup] = useState(false);
  const [savingTrialSettings, setSavingTrialSettings] = useState(false);
  const { toast } = useToast();

  const fetchPlans = async () => {
    const [{ data: plansData }, { data: subs }, { data: settingsData }] = await Promise.all([
      supabase.from("platform_plans" as any).select("*").order("sort_order"),
      supabase.from("organization_subscriptions").select("plan"),
      supabase.from("settings").select("key, value").in("key", ["default_trial_days", "default_grace_period_days", "trial_on_self_signup"]),
    ]);

    setPlans((plansData as any[])?.map((p: any) => ({
      ...p,
      features: Array.isArray(p.features) ? p.features : [],
      feature_flags: (p.feature_flags && typeof p.feature_flags === "object") ? p.feature_flags : { ...defaultFlags },
    })) ?? []);

    // Count subscribers per plan key
    const counts: Record<string, number> = {};
    (subs || []).forEach((s: any) => { counts[s.plan] = (counts[s.plan] || 0) + 1; });
    setSubscriberCounts(counts);

    // Load trial settings
    if (settingsData) {
      const settingsMap: Record<string, string> = {};
      settingsData.forEach((s: any) => { settingsMap[s.key] = s.value; });
      if (settingsMap.default_trial_days) setTrialDays(parseInt(settingsMap.default_trial_days) || 14);
      if (settingsMap.default_grace_period_days) setGracePeriodDays(parseInt(settingsMap.default_grace_period_days) || 7);
      if (settingsMap.trial_on_self_signup) setTrialOnSelfSignup(settingsMap.trial_on_self_signup === "true");
    }

    setLoading(false);
  };

  useEffect(() => { fetchPlans(); }, []);

  const saveTrialSettings = async () => {
    setSavingTrialSettings(true);
    const updates = [
      { key: "default_trial_days", value: String(trialDays) },
      { key: "default_grace_period_days", value: String(gracePeriodDays) },
      { key: "trial_on_self_signup", value: String(trialOnSelfSignup) },
    ];
    for (const u of updates) {
      await supabase.from("settings").update({ value: u.value }).eq("key", u.key);
    }
    setSavingTrialSettings(false);
    toast({ title: "Trial settings saved" });
  };

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setForm({ ...plan, feature_flags: { ...defaultFlags, ...plan.feature_flags } });
    setCreating(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyPlan, feature_flags: { ...defaultFlags } });
    setCreating(true);
  };

  const flagsToFeaturesList = (flags: Record<string, boolean>): string[] =>
    ALL_FEATURE_KEYS.filter(k => flags[k]).map(k => FEATURE_LABELS[k]);

  const handleSave = async () => {
    setSaving(true);
    const features = flagsToFeaturesList(form.feature_flags);
    const payload = { ...form, features, feature_flags: form.feature_flags };
    delete (payload as any).id;

    if (editing) {
      const { error } = await supabase.from("platform_plans" as any).update(payload as any).eq("id", editing.id);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else toast({ title: "Plan updated" });
    } else {
      const { error } = await supabase.from("platform_plans" as any).insert(payload as any);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else toast({ title: "Plan created" });
    }
    setSaving(false);
    setEditing(null);
    setCreating(false);
    fetchPlans();
  };

  const deletePlan = async (plan: Plan) => {
    if (!confirm(`Delete "${plan.name}" plan?`)) return;
    await supabase.from("platform_plans" as any).delete().eq("id", plan.id);
    fetchPlans();
    toast({ title: "Plan deleted" });
  };

  const toggleFlag = (key: string) => {
    setForm(prev => ({
      ...prev,
      feature_flags: { ...prev.feature_flags, [key]: !prev.feature_flags[key] },
    }));
  };

  const toggleAll = (enabled: boolean) => {
    setForm(prev => ({
      ...prev,
      feature_flags: Object.fromEntries(ALL_FEATURE_KEYS.map(k => [k, enabled])),
    }));
  };

  const enabledCount = (flags: Record<string, boolean>) => ALL_FEATURE_KEYS.filter(k => flags[k]).length;

  /* ─── Loading ─── */
  if (loading) return (
    <div className="space-y-6">
      <div className="h-10 w-64 rounded-lg shimmer" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[1,2,3].map(i => (
          <div key={i} className="glass-card rounded-xl p-6 space-y-4">
            <div className="h-6 w-32 rounded shimmer" />
            <div className="h-10 w-40 rounded shimmer" />
            <div className="flex gap-3">{[1,2,3].map(j => <div key={j} className="h-14 flex-1 rounded-lg shimmer" />)}</div>
            <div className="space-y-2">{[1,2,3,4].map(j => <div key={j} className="h-4 rounded shimmer" />)}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const showDialog = editing !== null || creating;

  const yearlySavings = (plan: Plan) => {
    if (!plan.price_bdt_monthly || !plan.price_bdt_yearly) return 0;
    const annualFromMonthly = plan.price_bdt_monthly * 12;
    if (annualFromMonthly <= 0) return 0;
    return Math.round(((annualFromMonthly - plan.price_bdt_yearly) / annualFromMonthly) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Plan Management"
        subtitle="Create and manage subscription tiers with feature enforcement"
        icon={<Crown className="h-6 w-6 text-primary" />}
        actions={
          <div className="flex items-center gap-3">
            {/* Billing Cycle Toggle */}
            <div className="flex items-center gap-1 rounded-full bg-muted/50 p-1 border border-border/50">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  billingCycle === "monthly"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle("yearly")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  billingCycle === "yearly"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Yearly
              </button>
            </div>
            <Button onClick={openCreate} className="gap-2 shimmer-btn">
              <Plus className="h-4 w-4" /> New Plan
            </Button>
          </div>
        }
      />

      {/* Plan Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan, idx) => {
          const savings = yearlySavings(plan);
          const subs = subscriberCounts[plan.key] || 0;
          const enabled = enabledCount(plan.feature_flags || {});
          const price = billingCycle === "monthly" ? plan.price_bdt_monthly : plan.price_bdt_yearly;
          const period = billingCycle === "monthly" ? "/mo" : "/yr";

          return (
            <div
              key={plan.id}
              className={`glass-card glow-border group relative animate-slide-up-fade ${
                !plan.is_active ? "opacity-50 grayscale" : ""
              } ${plan.is_popular ? "ring-2 ring-primary/40" : ""}`}
              style={{ animationDelay: `${idx * 80}ms`, animationFillMode: "both" }}
            >
              {/* Popular Ribbon */}
              {plan.is_popular && (
                <div className="absolute -top-px left-0 right-0 h-1 rounded-t-xl bg-gradient-to-r from-primary via-primary/80 to-accent-foreground" />
              )}

              {/* Card Actions — hover reveal */}
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm" onClick={() => openEdit(plan)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm text-destructive" onClick={() => deletePlan(plan)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                    {plan.is_popular && (
                      <Badge className="bg-primary/10 text-primary border-primary/20 gap-1 text-[10px]">
                        <Star className="h-2.5 w-2.5 fill-primary" /> Popular
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={plan.is_active ? "default" : "secondary"} className="text-[10px]">
                      {plan.is_active ? "Active" : "Archived"}
                    </Badge>
                    {subs > 0 && (
                      <span className="stat-pill text-[10px]">
                        <Users className="h-2.5 w-2.5" /> {subs} subscriber{subs > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Pricing */}
                <div className="space-y-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-foreground">৳{price.toLocaleString()}</span>
                    <span className="text-sm text-muted-foreground">{period}</span>
                  </div>
                  {billingCycle === "yearly" && savings > 0 && (
                    <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px]">
                      <Sparkles className="h-2.5 w-2.5 mr-1" /> Save {savings}%
                    </Badge>
                  )}
                  {billingCycle === "monthly" && (
                    <p className="text-xs text-muted-foreground">৳{plan.price_bdt_yearly.toLocaleString()}/yr</p>
                  )}
                </div>

                {/* Limits — stat pills */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: <Users className="h-3.5 w-3.5 text-primary" />, val: plan.max_clients, label: "Clients" },
                    { icon: <MonitorSmartphone className="h-3.5 w-3.5 text-primary" />, val: plan.max_ad_accounts, label: "Accounts" },
                    { icon: <UserCog className="h-3.5 w-3.5 text-primary" />, val: plan.max_managers, label: "Managers" },
                  ].map(({ icon, val, label }) => (
                    <div key={label} className="flex flex-col items-center gap-1 rounded-lg border border-border/50 bg-muted/30 p-2.5">
                      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10">{icon}</div>
                      <span className="text-lg font-bold text-foreground">{val}</span>
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>

                {/* Features */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Features</span>
                    <span className="text-[10px] text-muted-foreground">{enabled}/{ALL_FEATURE_KEYS.length}</span>
                  </div>
                  <Progress value={(enabled / ALL_FEATURE_KEYS.length) * 100} className="h-1.5" />
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1">
                    {ALL_FEATURE_KEYS.filter(k => plan.feature_flags?.[k]).map(key => (
                      <div key={key} className="flex items-center gap-1.5 text-[11px] text-foreground">
                        <Check className="h-3 w-3 text-success shrink-0" />
                        <span className="truncate">{FEATURE_LABELS[key]}</span>
                      </div>
                    ))}
                  </div>
                  {ALL_FEATURE_KEYS.filter(k => !plan.feature_flags?.[k]).length > 0 && (
                    <p className="text-[10px] text-muted-foreground/60">
                      +{ALL_FEATURE_KEYS.filter(k => !plan.feature_flags?.[k]).length} more not included
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Editor Dialog ─── */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) { setEditing(null); setCreating(false); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing ? <Pencil className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-primary" />}
              {editing ? "Edit Plan" : "Create Plan"}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="details" className="mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
              <TabsTrigger value="limits" className="flex-1">Limits & Pricing</TabsTrigger>
              <TabsTrigger value="features" className="flex-1">Features ({enabledCount(form.feature_flags)}/{ALL_FEATURE_KEYS.length})</TabsTrigger>
            </TabsList>

            {/* Tab: Details */}
            <TabsContent value="details" className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Plan Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Professional" />
                </div>
                <div className="space-y-1.5">
                  <Label>Plan Key</Label>
                  <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="e.g. professional" />
                </div>
              </div>
              <div className="flex items-center gap-6 pt-2">
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_popular} onCheckedChange={(v) => setForm({ ...form, is_popular: v })} />
                  <Label className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-warning" /> Mark as Popular</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                  <Label>Active</Label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Sort Order</Label>
                <Input type="number" className="w-24" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: +e.target.value })} />
              </div>
            </TabsContent>

            {/* Tab: Limits & Pricing */}
            <TabsContent value="limits" className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Monthly Price (BDT)</Label>
                  <Input type="number" value={form.price_bdt_monthly} onChange={(e) => setForm({ ...form, price_bdt_monthly: +e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Yearly Price (BDT)</Label>
                  <Input type="number" value={form.price_bdt_yearly} onChange={(e) => setForm({ ...form, price_bdt_yearly: +e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Max Clients</Label>
                  <Input type="number" value={form.max_clients} onChange={(e) => setForm({ ...form, max_clients: +e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><MonitorSmartphone className="h-3.5 w-3.5" /> Max Accounts</Label>
                  <Input type="number" value={form.max_ad_accounts} onChange={(e) => setForm({ ...form, max_ad_accounts: +e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><UserCog className="h-3.5 w-3.5" /> Max Managers</Label>
                  <Input type="number" value={form.max_managers} onChange={(e) => setForm({ ...form, max_managers: +e.target.value })} />
                </div>
              </div>
            </TabsContent>

            {/* Tab: Features */}
            <TabsContent value="features" className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {enabledCount(form.feature_flags)} of {ALL_FEATURE_KEYS.length} features enabled
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => toggleAll(true)}>
                    <Zap className="h-3 w-3 mr-1" /> Enable All
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => toggleAll(false)}>
                    <X className="h-3 w-3 mr-1" /> Disable All
                  </Button>
                </div>
              </div>
              <Progress value={(enabledCount(form.feature_flags) / ALL_FEATURE_KEYS.length) * 100} className="h-1.5" />
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/50 bg-muted/20 p-4">
                {ALL_FEATURE_KEYS.map((key) => (
                  <div
                    key={key}
                    className={`flex items-center justify-between gap-2 rounded-lg p-2.5 transition-colors ${
                      form.feature_flags[key] ? "bg-success/5 border border-success/20" : "bg-transparent border border-transparent"
                    }`}
                  >
                    <Label className="text-xs font-normal cursor-pointer flex items-center gap-2" htmlFor={`flag-${key}`}>
                      <span className="text-muted-foreground">{FEATURE_ICONS[key]}</span>
                      {FEATURE_LABELS[key]}
                    </Label>
                    <Switch
                      id={`flag-${key}`}
                      checked={!!form.feature_flags[key]}
                      onCheckedChange={() => toggleFlag(key)}
                    />
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {/* Save Button */}
          <Button onClick={handleSave} disabled={saving || !form.name || !form.key} className="w-full mt-4 shimmer-btn">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Update Plan" : "Create Plan"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
