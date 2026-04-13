import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Building2, Users, Monitor, UserCog } from "lucide-react";

interface PlanOption { key: string; name: string; max_clients: number; max_ad_accounts: number; max_managers: number; price_bdt_monthly: number; price_bdt_yearly: number; }

export default function CreateAgency() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [plan, setPlan] = useState<string>("starter");
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [customTrialDays, setCustomTrialDays] = useState<number | "">("");
  const [defaultTrialDays, setDefaultTrialDays] = useState(14);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.from("platform_plans").select("key, name, max_clients, max_ad_accounts, max_managers, price_bdt_monthly, price_bdt_yearly").eq("is_active", true).order("sort_order").then(({ data }) => {
      if (data?.length) setPlans(data as PlanOption[]);
    });
    supabase.from("settings").select("value").eq("key", "default_trial_days").single().then(({ data }) => {
      if (data?.value) setDefaultTrialDays(parseInt(data.value) || 14);
    });
  }, []);

  const selectedPlan = plans.find((p) => p.key === plan);

  const fetchPlanFeatureFlags = async (planKey: string): Promise<Record<string, boolean>> => {
    const { data } = await supabase.from("platform_plans").select("feature_flags").eq("key", planKey).single();
    return (data?.feature_flags && typeof data.feature_flags === "object") ? data.feature_flags as Record<string, boolean> : {};
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-client", { body: { email: ownerEmail, password: ownerPassword, full_name: ownerName, role: "admin" } });
      if (error) throw error;
      const adminUserId = data?.user_id;
      if (!adminUserId) throw new Error("Failed to create admin user");
      const featureFlags = await fetchPlanFeatureFlags(plan);
      const trialDays = customTrialDays ? Number(customTrialDays) : defaultTrialDays;
      const { data: org, error: orgError } = await supabase.from("organizations").insert({
        name, slug: slug || name.toLowerCase().replace(/\s+/g, "-"), owner_user_id: adminUserId, plan: plan as any, status: "trial",
        trial_ends_at: new Date(Date.now() + trialDays * 86400000).toISOString(),
        max_clients: selectedPlan?.max_clients ?? 5, max_ad_accounts: selectedPlan?.max_ad_accounts ?? 10, max_managers: selectedPlan?.max_managers ?? 2,
        allowed_features: featureFlags as any,
      }).select().single();
      if (orgError) throw orgError;
      await supabase.from("profiles").update({ org_id: org.id, is_super_admin: true }).eq("user_id", adminUserId);
      const periodStart = new Date().toISOString().slice(0, 10);
      const periodEnd = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      await supabase.from("organization_subscriptions").insert({
        org_id: org.id, plan: plan as any, amount_bdt: selectedPlan?.price_bdt_monthly ?? 0,
        billing_cycle: "monthly", current_period_start: periodStart, current_period_end: periodEnd, payment_status: "pending",
      });
      toast({ title: "Agency created", description: `${name} is now live with a 14-day trial.` });
      navigate("/platform/agencies");
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate("/platform/agencies")} className="gap-2 press-effect">
        <ArrowLeft className="h-4 w-4" /> Back to Agencies
      </Button>

      <PageHeader title="Create New Agency" subtitle="Set up a new agency with admin credentials" icon={<Building2 className="h-6 w-6 text-primary" />} />

      <div className="glass-card glow-border animate-slide-up-fade" style={{ animationFillMode: "forwards" }}>
        <Card className="border-0 bg-transparent shadow-none">
          <CardContent className="p-6">
            <form onSubmit={handleCreate} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>Agency Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Acme Marketing" /></div>
                <div className="space-y-2"><Label>Slug</Label><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-marketing" /></div>
              </div>

              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={plan} onValueChange={setPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plans.length > 0 ? plans.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.name} ({p.max_clients}C/{p.max_ad_accounts}A/{p.max_managers}M) — ৳{p.price_bdt_monthly}/mo
                      </SelectItem>
                    )) : (
                      <>
                        <SelectItem value="starter">Starter (5C/10A/2M)</SelectItem>
                        <SelectItem value="growth">Growth (20C/50A/5M)</SelectItem>
                        <SelectItem value="agency_pro">Agency Pro (Unlimited)</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                {selectedPlan && (
                  <div className="flex gap-3 mt-2">
                    <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" />{selectedPlan.max_clients} clients</Badge>
                    <Badge variant="outline" className="gap-1"><Monitor className="h-3 w-3" />{selectedPlan.max_ad_accounts} accounts</Badge>
                    <Badge variant="outline" className="gap-1"><UserCog className="h-3 w-3" />{selectedPlan.max_managers} managers</Badge>
                  </div>
                )}
              </div>

              <div className="border-t border-border/40 pt-5 space-y-1">
                <p className="text-sm font-semibold text-foreground">Agency Admin Account</p>
                <p className="text-xs text-muted-foreground">This user will be the agency's super admin.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>Admin Name</Label><Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required placeholder="John Doe" /></div>
                <div className="space-y-2"><Label>Admin Email</Label><Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required placeholder="admin@agency.com" /></div>
              </div>
              <div className="space-y-2"><Label>Password</Label><Input type="password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} required minLength={6} placeholder="••••••••" /></div>

              <Button type="submit" className="w-full press-effect" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Agency
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
