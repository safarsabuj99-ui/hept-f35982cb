import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plug, RefreshCw, Clock, Plus, Trash2 } from "lucide-react";

const PLATFORMS = [
  { key: "meta", label: "Meta (Facebook)" },
  { key: "tiktok", label: "TikTok" },
  { key: "google", label: "Google Ads" },
];

export default function Integrations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newForm, setNewForm] = useState({ platform: "meta", instance_name: "", api_token: "", app_id: "", token_expiry_date: "" });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    const { data } = await (supabase.from("api_integrations" as any).select("*").order("created_at", { ascending: false }) as any);
    setIntegrations(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const saveIntegration = async (id: string, updates: any) => {
    const { error } = await (supabase.from("api_integrations" as any) as any).update(updates).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved" });
      fetchData();
    }
  };

  const addInstance = async () => {
    if (!newForm.instance_name.trim()) return;
    setSaving(true);
    const { error } = await (supabase.from("api_integrations" as any) as any).insert({
      platform: newForm.platform,
      instance_name: newForm.instance_name,
      api_token: newForm.api_token,
      app_id: newForm.app_id,
      token_expiry_date: newForm.token_expiry_date || null,
      updated_by: user?.id,
      is_active: true,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Added", description: `${newForm.instance_name} instance created` });
      setAddOpen(false);
      setNewForm({ platform: "meta", instance_name: "", api_token: "", app_id: "", token_expiry_date: "" });
      fetchData();
    }
  };

  const deleteInstance = async (id: string) => {
    const { error } = await (supabase.from("api_integrations" as any) as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted" });
      fetchData();
    }
  };

  const simulateSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("sync-ad-spend", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw res.error;
      const body = res.data;
      toast({
        title: "Sync Complete",
        description: `${body.records_created} records | ${body.auto_mapped} auto-mapped | ${body.unmapped} unmapped (rate: ${body.exchange_rate_used})`,
      });
      fetchData();
    } catch (err: any) {
      toast({ title: "Sync Failed", description: err.message || "Unknown error", variant: "destructive" });
    }
    setSyncing(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const grouped = PLATFORMS.map((p) => ({
    ...p,
    instances: integrations.filter((i: any) => i.platform === p.key),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Integrations</h1>
          <p className="text-muted-foreground">Configure multi-instance platform API credentials</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Plus className="mr-2 h-4 w-4" /> Add Instance</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New API Instance</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select value={newForm.platform} onValueChange={(v) => setNewForm({ ...newForm, platform: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Instance Name *</Label>
                  <Input value={newForm.instance_name} onChange={(e) => setNewForm({ ...newForm, instance_name: e.target.value })} placeholder="e.g. BM Account 1" />
                </div>
                <div className="space-y-2">
                  <Label>API Token</Label>
                  <Input type="password" value={newForm.api_token} onChange={(e) => setNewForm({ ...newForm, api_token: e.target.value })} placeholder="Enter API token" />
                </div>
                <div className="space-y-2">
                  <Label>App ID</Label>
                  <Input value={newForm.app_id} onChange={(e) => setNewForm({ ...newForm, app_id: e.target.value })} placeholder="Enter App ID" />
                </div>
                <div className="space-y-2">
                  <Label>Token Expiry Date</Label>
                  <Input type="date" value={newForm.token_expiry_date} onChange={(e) => setNewForm({ ...newForm, token_expiry_date: e.target.value })} />
                </div>
                <Button onClick={addInstance} className="w-full" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Instance
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button onClick={simulateSync} disabled={syncing}>
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Simulate Sync
          </Button>
        </div>
      </div>

      {grouped.map(({ key, label, instances }) => (
        <div key={key} className="space-y-3">
          <h2 className="text-lg font-semibold">{label}</h2>
          {instances.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-muted-foreground text-sm">
                No instances configured. Click "Add Instance" to connect.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {instances.map((inst: any) => (
                <Card key={inst.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">
                        {inst.instance_name || key}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {inst.token_expiry_date && (() => {
                          const days = Math.ceil((new Date(inst.token_expiry_date).getTime() - Date.now()) / 86400000);
                          if (days <= 0) return <Badge variant="destructive" className="text-xs">Expired</Badge>;
                          if (days <= 3) return <Badge variant="destructive" className="text-xs">{days}d left</Badge>;
                          if (days <= 7) return <Badge className="bg-warning text-warning-foreground text-xs">{days}d left</Badge>;
                          return null;
                        })()}
                        <Badge variant="default" className="bg-success text-success-foreground text-xs">Active</Badge>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteInstance(inst.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {inst.last_synced_at && (
                      <CardDescription className="flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3" /> Synced: {new Date(inst.last_synced_at).toLocaleString()}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs">API Token</Label>
                      <Input type="password" defaultValue={inst.api_token} onBlur={(e) => { if (e.target.value !== inst.api_token) saveIntegration(inst.id, { api_token: e.target.value }); }} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">App ID</Label>
                      <Input defaultValue={inst.app_id} onBlur={(e) => { if (e.target.value !== inst.app_id) saveIntegration(inst.id, { app_id: e.target.value }); }} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
