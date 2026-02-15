import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plug, RefreshCw, Clock } from "lucide-react";

const PLATFORMS = [
  { key: "meta", label: "Meta (Facebook)", color: "hsl(var(--chart-meta))" },
  { key: "tiktok", label: "TikTok", color: "hsl(var(--chart-tiktok))" },
  { key: "google", label: "Google Ads", color: "hsl(var(--chart-google))" },
];

export default function Integrations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [forms, setForms] = useState<Record<string, { api_token: string; app_id: string }>>({
    meta: { api_token: "", app_id: "" },
    tiktok: { api_token: "", app_id: "" },
    google: { api_token: "", app_id: "" },
  });

  const fetchData = async () => {
    const { data } = await (supabase.from("api_integrations" as any).select("*") as any);
    setIntegrations(data ?? []);
    const f = { ...forms };
    for (const row of data ?? []) {
      f[row.platform] = { api_token: row.api_token, app_id: row.app_id };
    }
    setForms(f);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const saveIntegration = async (platform: string) => {
    const existing = integrations.find((i: any) => i.platform === platform);
    const payload = { platform, ...forms[platform], updated_by: user?.id, is_active: true };

    let error;
    if (existing) {
      ({ error } = await (supabase.from("api_integrations" as any) as any).update(payload).eq("id", existing.id));
    } else {
      ({ error } = await (supabase.from("api_integrations" as any) as any).insert(payload));
    }

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `${platform} integration updated` });
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
      toast({ title: "Sync Complete", description: `${body.records_created} spend records created (rate: ${body.exchange_rate_used} BDT/USD)` });
      fetchData();
    } catch (err: any) {
      toast({ title: "Sync Failed", description: err.message || "Unknown error", variant: "destructive" });
    }
    setSyncing(false);
  };

  const getIntegration = (platform: string) => integrations.find((i: any) => i.platform === platform);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Integrations</h1>
          <p className="text-muted-foreground">Configure platform API credentials and sync ad spend</p>
        </div>
        <Button onClick={simulateSync} disabled={syncing} variant="default">
          {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Simulate Sync
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLATFORMS.map(({ key, label }) => {
          const integration = getIntegration(key);
          return (
            <Card key={key}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{label}</CardTitle>
                  {integration ? (
                    <Badge variant="default" className="bg-success text-success-foreground">Connected</Badge>
                  ) : (
                    <Badge variant="secondary">Not Connected</Badge>
                  )}
                </div>
                {integration?.last_synced_at && (
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <Clock className="h-3 w-3" /> Last synced: {new Date(integration.last_synced_at).toLocaleString()}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">API Token</Label>
                  <Input type="password" value={forms[key].api_token} onChange={(e) => setForms({ ...forms, [key]: { ...forms[key], api_token: e.target.value } })} placeholder="Enter API token" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">App ID</Label>
                  <Input value={forms[key].app_id} onChange={(e) => setForms({ ...forms, [key]: { ...forms[key], app_id: e.target.value } })} placeholder="Enter App ID" />
                </div>
                <Button onClick={() => saveIntegration(key)} className="w-full" variant="secondary" size="sm">
                  <Plug className="mr-2 h-3 w-3" /> Save
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
