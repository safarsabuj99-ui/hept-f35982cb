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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plug, RefreshCw, Clock, Plus, Trash2, CheckCircle2, XCircle, AlertTriangle, BookOpen, ExternalLink, Zap, Shield } from "lucide-react";
import { differenceInDays } from "date-fns";

const PLATFORMS = [
  { key: "meta", label: "Meta (Facebook)" },
  { key: "tiktok", label: "TikTok" },
  { key: "google", label: "Google Ads" },
];

const SETUP_GUIDES: Record<string, { steps: string[]; link: string; linkLabel: string; tips: string[] }> = {
  meta: {
    steps: [
      "Go to Meta Business Suite → Settings → Business Settings",
      "Navigate to Users → System Users → click 'Add'",
      "Give the system user a name (e.g., 'Ad Manager API') and set role to 'Admin'",
      "Click 'Generate New Token' and select the app",
      "Select permissions: ads_management, ads_read, business_management, read_insights",
      "Set token expiry to 'Never' for a permanent token",
      "Copy the generated token — it will only be shown once!",
      "For App ID: Go to developers.facebook.com → Your App → Settings → Basic → Copy 'App ID'",
    ],
    link: "https://business.facebook.com/settings/system-users",
    linkLabel: "Open Meta Business Settings",
    tips: [
      "Use a System User token (not a personal token) — they never expire",
      "The system user must have access to the Business Manager that owns the ad accounts",
      "If you manage multiple Business Managers, create one integration instance per BM",
    ],
  },
  tiktok: {
    steps: [
      "Go to TikTok Developer Portal → My Apps → select your app",
      "Copy your App ID (this is also your TikTok Developer App ID)",
      "Open the Advertiser Authorization URL from your app's settings",
      "Click 'Confirm' to authorize — you'll be redirected with an auth_code in the URL",
      "Copy the auth_code from the redirect URL (e.g. ?auth_code=abc123...)",
      "Paste it below and click 'Exchange for Token' to get a long-lived access token",
      "For App ID: Enter your Business Center ID (BC ID) — this discovers all advertiser accounts",
    ],
    link: "https://business-api.tiktok.com/portal/docs",
    linkLabel: "Open TikTok Developer Portal",
    tips: [
      "The auth_code expires in ~10 minutes — exchange it quickly after authorization",
      "Long-lived tokens last 365 days — set a reminder to refresh before expiry",
      "Your BC ID discovers ALL advertiser accounts automatically — no need to enter IDs manually",
      "Make sure your app has 'Ad Account Management', 'Reporting', and 'Business Center Management' scopes",
    ],
  },
  google: {
    steps: [
      "Go to Google Ads API Center in your Google Ads account",
      "Apply for API access (Standard or Basic) if not already approved",
      "Create OAuth 2.0 credentials in Google Cloud Console",
      "Use the OAuth Playground to generate a Refresh Token",
      "Authorize with scopes: https://www.googleapis.com/auth/adwords",
      "Copy the Refresh Token as your API Token",
      "For App ID: Enter your Google Ads Developer Token",
    ],
    link: "https://developers.google.com/google-ads/api/docs/first-call/overview",
    linkLabel: "Open Google Ads API Docs",
    tips: [
      "Google Ads uses OAuth refresh tokens — they don't expire unless revoked",
      "You need a Developer Token (apply via Google Ads account settings)",
      "Manager accounts (MCC) can access all linked child accounts with one token",
    ],
  },
};

export default function Integrations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string; details?: string }>>({});
  const [newForm, setNewForm] = useState({ platform: "meta", instance_name: "", api_token: "", app_id: "", token_expiry_date: "" });
  const [saving, setSaving] = useState(false);
  const [tiktokAuthCode, setTiktokAuthCode] = useState("");
  const [tiktokAppId, setTiktokAppId] = useState("");
  const [tiktokAppSecret, setTiktokAppSecret] = useState("");
  const [exchangingToken, setExchangingToken] = useState(false);
  const [exchangeResult, setExchangeResult] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchData = async () => {
    const { data } = await (supabase.from("api_integrations" as any).select("*").order("created_at", { ascending: false }) as any);
    setIntegrations(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("integrations-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "api_integrations" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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

  const testConnection = async (id: string) => {
    setTestingId(id);
    setTestResults((prev) => ({ ...prev, [id]: undefined as any }));
    try {
      const { data, error } = await supabase.functions.invoke("test-connection", {
        body: { integration_id: id },
      });
      if (error) throw error;
      setTestResults((prev) => ({ ...prev, [id]: data }));
      toast({
        title: data.ok ? "Connection Successful" : "Connection Failed",
        description: data.message,
        variant: data.ok ? "default" : "destructive",
      });
    } catch (err: any) {
      setTestResults((prev) => ({ ...prev, [id]: { ok: false, message: err.message } }));
      toast({ title: "Test Failed", description: err.message, variant: "destructive" });
    }
    setTestingId(null);
  };

  const simulateSync = async () => {
    setSyncing(true);
    try {
      const res = await supabase.functions.invoke("sync-fast-lane");
      if (res.error) throw res.error;
      const body = res.data;
      toast({
        title: "Sync Complete",
        description: `Synced ${body.synced || 0} accounts | Skipped ${body.skipped_no_keyword_match || 0} unmatched`,
      });
      fetchData();
    } catch (err: any) {
      toast({ title: "Sync Failed", description: err.message || "Unknown error", variant: "destructive" });
    }
    setSyncing(false);
  };

  const getTokenHealth = (inst: any): { status: "ok" | "warning" | "expired" | "unknown"; label: string; daysLeft: number | null } => {
    if (!inst.token_expiry_date) return { status: "unknown", label: "No expiry set", daysLeft: null };
    const days = differenceInDays(new Date(inst.token_expiry_date), new Date());
    if (days <= 0) return { status: "expired", label: "Expired", daysLeft: days };
    if (days <= 3) return { status: "expired", label: `${days}d left`, daysLeft: days };
    if (days <= 7) return { status: "warning", label: `${days}d left`, daysLeft: days };
    if (days <= 30) return { status: "warning", label: `${days}d left`, daysLeft: days };
    return { status: "ok", label: `${days}d left`, daysLeft: days };
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const grouped = PLATFORMS.map((p) => ({
    ...p,
    instances: integrations.filter((i: any) => i.platform === p.key),
  }));

  // Health overview
  const totalIntegrations = integrations.length;
  const expiredCount = integrations.filter((i) => getTokenHealth(i).status === "expired").length;
  const warningCount = integrations.filter((i) => getTokenHealth(i).status === "warning").length;
  const healthyCount = totalIntegrations - expiredCount - warningCount;

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
            <DialogContent className="max-h-[85vh] overflow-y-auto">
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

                {/* Inline setup guide for selected platform */}
                {SETUP_GUIDES[newForm.platform] && (
                  <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <BookOpen className="h-4 w-4 text-primary" />
                      How to get your {PLATFORMS.find(p => p.key === newForm.platform)?.label} credentials
                    </div>
                    <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
                      {SETUP_GUIDES[newForm.platform].steps.map((step, i) => (
                        <li key={i} className="leading-relaxed">{step}</li>
                      ))}
                    </ol>
                    <a
                      href={SETUP_GUIDES[newForm.platform].link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {SETUP_GUIDES[newForm.platform].linkLabel}
                    </a>
                  </div>
                )}

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
                {/* TikTok OAuth Token Exchange */}
                {newForm.platform === "tiktok" && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Zap className="h-4 w-4 text-primary" />
                      TikTok OAuth — Exchange Auth Code for Token
                    </div>
                    <p className="text-xs text-muted-foreground">
                      After authorizing your app, paste the auth_code from the redirect URL here. 
                      Your TikTok Developer App ID is needed for the exchange (not the BC ID above).
                    </p>
                    <div className="space-y-2">
                      <Label className="text-xs">TikTok Developer App ID</Label>
                      <Input
                        value={tiktokAppId}
                        onChange={(e) => setTiktokAppId(e.target.value)}
                        placeholder="e.g. 7615506076583673857"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">App Secret</Label>
                      <Input
                        type="password"
                        value={tiktokAppSecret}
                        onChange={(e) => setTiktokAppSecret(e.target.value)}
                        placeholder="From Developer Portal → Basic Information"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Auth Code</Label>
                      <Input
                        value={tiktokAuthCode}
                        onChange={(e) => setTiktokAuthCode(e.target.value)}
                        placeholder="Paste auth_code from redirect URL"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      disabled={exchangingToken || !tiktokAuthCode.trim() || !tiktokAppId.trim() || !tiktokAppSecret.trim()}
                      onClick={async () => {
                        setExchangingToken(true);
                        setExchangeResult(null);
                        try {
                          const { data, error } = await supabase.functions.invoke("tiktok-exchange-token", {
                            body: { auth_code: tiktokAuthCode.trim(), app_id: tiktokAppId.trim(), app_secret: tiktokAppSecret.trim() },
                          });
                          if (error) throw error;
                          if (data.ok) {
                            setNewForm((prev) => ({
                              ...prev,
                              api_token: data.access_token,
                              token_expiry_date: data.expiry_date || "",
                            }));
                            setExchangeResult({ ok: true, message: data.message });
                            toast({ title: "Token Obtained!", description: data.message });
                          } else {
                            setExchangeResult({ ok: false, message: data.message });
                            toast({ title: "Exchange Failed", description: data.message, variant: "destructive" });
                          }
                        } catch (err: any) {
                          setExchangeResult({ ok: false, message: err.message });
                          toast({ title: "Exchange Failed", description: err.message, variant: "destructive" });
                        }
                        setExchangingToken(false);
                      }}
                    >
                      {exchangingToken ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                      {exchangingToken ? "Exchanging…" : "Exchange for Token"}
                    </Button>
                    {exchangeResult && (
                      <div className={`rounded-md p-2.5 text-xs ${exchangeResult.ok ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 border border-destructive/30 text-destructive"}`}>
                        <div className="flex items-center gap-1.5">
                          {exchangeResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {exchangeResult.message}
                        </div>
                        {exchangeResult.ok && (
                          <p className="mt-1 text-muted-foreground">✅ Token & expiry auto-filled below</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Token Expiry Date</Label>
                  <Input type="date" value={newForm.token_expiry_date} onChange={(e) => setNewForm({ ...newForm, token_expiry_date: e.target.value })} />
                  <p className="text-[10px] text-muted-foreground">Leave blank for tokens that never expire (e.g. Meta System User tokens)</p>
                </div>
                <Button onClick={addInstance} className="w-full" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Instance
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button onClick={simulateSync} disabled={syncing}>
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sync Now
          </Button>
        </div>
      </div>

      {/* Token Health Overview */}
      {totalIntegrations > 0 && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Plug className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-semibold">{totalIntegrations}</p>
                  <p className="text-xs text-muted-foreground">Total Integrations</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-2xl font-semibold">{healthyCount}</p>
                  <p className="text-xs text-muted-foreground">Healthy</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="text-2xl font-semibold">{warningCount}</p>
                  <p className="text-xs text-muted-foreground">Expiring Soon</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <XCircle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-2xl font-semibold">{expiredCount}</p>
                  <p className="text-xs text-muted-foreground">Expired</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections" className="gap-1.5"><Plug className="h-3.5 w-3.5" /> Connections</TabsTrigger>
          <TabsTrigger value="guides" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" /> Setup Guides</TabsTrigger>
        </TabsList>

        {/* CONNECTIONS TAB */}
        <TabsContent value="connections" className="space-y-6 mt-4">
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
                  {instances.map((inst: any) => {
                    const health = getTokenHealth(inst);
                    const testResult = testResults[inst.id];
                    const isTesting = testingId === inst.id;

                    return (
                      <Card key={inst.id} className={health.status === "expired" ? "border-destructive/50" : ""}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">
                              {inst.instance_name || key}
                            </CardTitle>
                            <div className="flex items-center gap-1.5">
                              {health.status === "expired" && (
                                <Badge variant="destructive" className="text-[10px]">{health.label}</Badge>
                              )}
                              {health.status === "warning" && (
                                <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 text-[10px]">
                                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> {health.label}
                                </Badge>
                              )}
                              {health.status === "ok" && (
                                <Badge variant="outline" className="text-[10px] text-emerald-600">
                                  <Shield className="h-2.5 w-2.5 mr-0.5" /> {health.label}
                                </Badge>
                              )}
                              {health.status === "unknown" && (
                                <Badge variant="outline" className="text-[10px]">No expiry</Badge>
                              )}
                              <Badge
                                variant="default"
                                className={`text-[10px] ${inst.connection_status === "error" ? "bg-destructive text-destructive-foreground" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"}`}
                              >
                                {inst.connection_status === "error" ? "Error" : "Active"}
                              </Badge>
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
                        <CardContent className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs">API Token</Label>
                            <Input type="password" defaultValue={inst.api_token} onBlur={(e) => { if (e.target.value !== inst.api_token) saveIntegration(inst.id, { api_token: e.target.value }); }} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">App ID</Label>
                            <Input defaultValue={inst.app_id} onBlur={(e) => { if (e.target.value !== inst.app_id) saveIntegration(inst.id, { app_id: e.target.value }); }} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Token Expiry</Label>
                            <Input
                              type="date"
                              defaultValue={inst.token_expiry_date || ""}
                              onBlur={(e) => {
                                const newVal = e.target.value || null;
                                if (newVal !== inst.token_expiry_date) saveIntegration(inst.id, { token_expiry_date: newVal });
                              }}
                            />
                          </div>

                          {/* Test Connection Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full gap-2"
                            disabled={isTesting}
                            onClick={() => testConnection(inst.id)}
                          >
                            {isTesting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Zap className="h-3.5 w-3.5" />
                            )}
                            {isTesting ? "Testing…" : "Test Connection"}
                          </Button>

                          {/* Test Result */}
                          {testResult && (
                            <div className={`rounded-md p-2.5 text-xs space-y-1 ${testResult.ok ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-destructive/10 border border-destructive/30"}`}>
                              <div className="flex items-center gap-1.5 font-medium">
                                {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                                {testResult.message}
                              </div>
                              {testResult.details && (
                                <p className="text-muted-foreground pl-5">{testResult.details}</p>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </TabsContent>

        {/* SETUP GUIDES TAB */}
        <TabsContent value="guides" className="space-y-6 mt-4">
          {PLATFORMS.map((p) => {
            const guide = SETUP_GUIDES[p.key];
            if (!guide) return null;
            return (
              <Card key={p.key}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      {p.label} Setup Guide
                    </CardTitle>
                    <a
                      href={guide.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {guide.linkLabel}
                    </a>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Step-by-Step Instructions</h4>
                    <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                      {guide.steps.map((step, i) => (
                        <li key={i} className="leading-relaxed">{step}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-primary" /> Pro Tips
                    </h4>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      {guide.tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
