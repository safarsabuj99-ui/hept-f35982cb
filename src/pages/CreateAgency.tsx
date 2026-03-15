import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft } from "lucide-react";

export default function CreateAgency() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [plan, setPlan] = useState<string>("starter");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Create admin user via edge function
      const { data, error } = await supabase.functions.invoke("create-client", {
        body: { email: ownerEmail, password: ownerPassword, full_name: ownerName, role: "admin" },
      });

      if (error) throw error;
      const adminUserId = data?.user_id;
      if (!adminUserId) throw new Error("Failed to create admin user");

      // Create organization
      const { data: org, error: orgError } = await supabase.from("organizations").insert({
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, "-"),
        owner_user_id: adminUserId,
        plan: plan as any,
        status: "trial",
        trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      }).select().single();

      if (orgError) throw orgError;

      // Link admin profile to org
      await supabase.from("profiles").update({ org_id: org.id, is_super_admin: true }).eq("user_id", adminUserId);

      toast({ title: "Agency created", description: `${name} is now live with a 14-day trial.` });
      navigate("/platform/agencies");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate("/platform/agencies")} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to Agencies
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Create New Agency</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Agency Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Acme Marketing" />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-marketing" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter (5C/10A/2M)</SelectItem>
                  <SelectItem value="growth">Growth (20C/50A/5M)</SelectItem>
                  <SelectItem value="agency_pro">Agency Pro (Unlimited)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-5 space-y-1">
              <p className="text-sm font-semibold text-foreground">Agency Admin Account</p>
              <p className="text-xs text-muted-foreground">This user will be the agency's super admin.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Admin Name</Label>
                <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required placeholder="John Doe" />
              </div>
              <div className="space-y-2">
                <Label>Admin Email</Label>
                <Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required placeholder="admin@agency.com" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Agency
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
