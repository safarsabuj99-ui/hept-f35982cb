import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Star, Trash2 } from "lucide-react";

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
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
}

const emptyPlan: Omit<Plan, "id"> = {
  name: "", key: "", price_bdt_monthly: 0, price_bdt_yearly: 0,
  max_clients: 5, max_ad_accounts: 10, max_managers: 2,
  features: [], is_popular: false, is_active: true, sort_order: 0,
};

export default function PlatformPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<Plan, "id">>(emptyPlan);
  const [featuresText, setFeaturesText] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchPlans = async () => {
    const { data } = await supabase.from("platform_plans" as any).select("*").order("sort_order");
    setPlans((data as any[])?.map((p: any) => ({ ...p, features: Array.isArray(p.features) ? p.features : [] })) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchPlans(); }, []);

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setForm({ ...plan });
    setFeaturesText(plan.features.join("\n"));
    setCreating(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyPlan });
    setFeaturesText("");
    setCreating(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...form, features: featuresText.split("\n").map((f) => f.trim()).filter(Boolean) };
    
    if (editing) {
      const { error } = await supabase.from("platform_plans" as any).update(payload as any).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
      else { toast({ title: "Plan updated" }); }
    } else {
      const { error } = await supabase.from("platform_plans" as any).insert(payload as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
      else { toast({ title: "Plan created" }); }
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

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const showDialog = editing !== null || creating;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Plan Management</h1>
          <p className="text-sm text-muted-foreground">Create and manage subscription tiers</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> New Plan</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className={`relative ${!plan.is_active ? "opacity-50" : ""}`}>
            {plan.is_popular && (
              <div className="absolute -top-2 right-4">
                <Badge className="bg-warning text-warning-foreground gap-1"><Star className="h-3 w-3" /> Popular</Badge>
              </div>
            )}
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(plan)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deletePlan(plan)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <Badge variant={plan.is_active ? "default" : "secondary"}>{plan.is_active ? "Active" : "Inactive"}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-2xl font-bold text-foreground">৳{plan.price_bdt_monthly.toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <p className="text-xs text-muted-foreground">৳{plan.price_bdt_yearly.toLocaleString()}/yr</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded border p-2"><p className="text-lg font-bold text-foreground">{plan.max_clients}</p><p className="text-[10px] text-muted-foreground">Clients</p></div>
                <div className="rounded border p-2"><p className="text-lg font-bold text-foreground">{plan.max_ad_accounts}</p><p className="text-[10px] text-muted-foreground">Accounts</p></div>
                <div className="rounded border p-2"><p className="text-lg font-bold text-foreground">{plan.max_managers}</p><p className="text-[10px] text-muted-foreground">Managers</p></div>
              </div>
              <ul className="space-y-1">
                {plan.features.map((f, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="text-success">✓</span> {f}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) { setEditing(null); setCreating(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Plan" : "Create Plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Key</Label><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="e.g. starter" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Monthly Price (BDT)</Label><Input type="number" value={form.price_bdt_monthly} onChange={(e) => setForm({ ...form, price_bdt_monthly: +e.target.value })} /></div>
              <div><Label>Yearly Price (BDT)</Label><Input type="number" value={form.price_bdt_yearly} onChange={(e) => setForm({ ...form, price_bdt_yearly: +e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Max Clients</Label><Input type="number" value={form.max_clients} onChange={(e) => setForm({ ...form, max_clients: +e.target.value })} /></div>
              <div><Label>Max Accounts</Label><Input type="number" value={form.max_ad_accounts} onChange={(e) => setForm({ ...form, max_ad_accounts: +e.target.value })} /></div>
              <div><Label>Max Managers</Label><Input type="number" value={form.max_managers} onChange={(e) => setForm({ ...form, max_managers: +e.target.value })} /></div>
            </div>
            <div>
              <Label>Features (one per line)</Label>
              <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]" value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_popular} onCheckedChange={(v) => setForm({ ...form, is_popular: v })} />
                <Label>Popular</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" className="w-20" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: +e.target.value })} />
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving || !form.name || !form.key} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Update Plan" : "Create Plan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
