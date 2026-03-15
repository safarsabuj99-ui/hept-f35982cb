import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export default function AgencyDetail() {
  const { agencyId } = useParams<{ agencyId: string }>();
  const [org, setOrg] = useState<Tables<"organizations"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!agencyId) return;
    supabase.from("organizations").select("*").eq("id", agencyId).single().then(({ data }) => {
      setOrg(data);
      setLoading(false);
    });
  }, [agencyId]);

  const updateField = async (field: string, value: any) => {
    if (!agencyId) return;
    setSaving(true);
    const { error } = await supabase.from("organizations").update({ [field]: value } as any).eq("id", agencyId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setOrg((prev) => prev ? { ...prev, [field]: value } : prev);
      toast({ title: "Updated" });
    }
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!org) return <p className="text-muted-foreground">Agency not found</p>;

  const statusColor: Record<string, string> = {
    active: "bg-success/10 text-success",
    trial: "bg-warning/10 text-warning",
    suspended: "bg-destructive/10 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate("/platform/agencies")} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{org.name}</h1>
          <p className="text-sm text-muted-foreground">/{org.slug}</p>
        </div>
        <Badge className={statusColor[org.status] ?? ""}>{org.status}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Plan</CardTitle></CardHeader>
          <CardContent>
            <Select value={org.plan} onValueChange={(v) => updateField("plan", v)} disabled={saving}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="agency_pro">Agency Pro</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Status</CardTitle></CardHeader>
          <CardContent>
            <Select value={org.status} onValueChange={(v) => updateField("status", v)} disabled={saving}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Resource Limits</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3 text-center">
            <div className="rounded-lg border p-4">
              <p className="text-2xl font-bold text-foreground">{org.max_clients}</p>
              <p className="text-xs text-muted-foreground">Max Clients</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-2xl font-bold text-foreground">{org.max_ad_accounts}</p>
              <p className="text-xs text-muted-foreground">Max Ad Accounts</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-2xl font-bold text-foreground">{org.max_managers}</p>
              <p className="text-xs text-muted-foreground">Max Managers</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
