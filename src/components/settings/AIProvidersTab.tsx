import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, KeyRound, CheckCircle2, XCircle, Sparkles, Trash2, ExternalLink } from "lucide-react";

type Provider = "openai" | "anthropic" | "gemini";

const PROVIDERS: { id: Provider; name: string; placeholder: string; keyUrl: string; defaultModel: string; modelOptions: string[] }[] = [
  {
    id: "openai", name: "OpenAI",
    placeholder: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4o-mini",
    modelOptions: ["gpt-4o-mini", "gpt-4o", "gpt-5", "gpt-5-mini", "o1-mini"],
  },
  {
    id: "anthropic", name: "Anthropic Claude",
    placeholder: "sk-ant-...",
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-3-5-sonnet-latest",
    modelOptions: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-sonnet-4-5", "claude-opus-4"],
  },
  {
    id: "gemini", name: "Google Gemini",
    placeholder: "AIza...",
    keyUrl: "https://aistudio.google.com/app/apikey",
    defaultModel: "gemini-2.5-flash",
    modelOptions: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash", "gemini-1.5-pro"],
  },
];

interface Config {
  id?: string;
  provider: Provider;
  has_key: boolean;
  default_model: string | null;
  is_active: boolean;
  monthly_budget_usd: number;
  usage_this_month_usd: number;
}

export function AIProvidersTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<Record<Provider, Config>>({} as any);
  const [drafts, setDrafts] = useState<Record<Provider, string>>({ openai: "", anthropic: "", gemini: "" });
  const [saving, setSaving] = useState<Provider | null>(null);
  const [testing, setTesting] = useState<Provider | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_provider_configs")
      .select("id, provider, api_key, default_model, is_active, monthly_budget_usd, usage_this_month_usd");
    if (error) {
      toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    }
    const map: Record<Provider, Config> = {} as any;
    for (const p of PROVIDERS) {
      const row = (data || []).find((r: any) => r.provider === p.id);
      map[p.id] = {
        id: row?.id,
        provider: p.id,
        has_key: !!row?.api_key,
        default_model: row?.default_model ?? p.defaultModel,
        is_active: row?.is_active ?? true,
        monthly_budget_usd: Number(row?.monthly_budget_usd ?? 50),
        usage_this_month_usd: Number(row?.usage_this_month_usd ?? 0),
      };
    }
    setConfigs(map);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user]);

  const testKey = async (provider: Provider) => {
    const key = drafts[provider].trim();
    if (!key) { toast({ title: "Paste an API key first", variant: "destructive" }); return; }
    setTesting(provider);
    try {
      const { data, error } = await supabase.functions.invoke("ai-provider-test", { body: { provider, api_key: key } });
      if (error) throw error;
      if (data?.ok) {
        toast({ title: "Key works ✓", description: `${data.models?.length ?? "?"} models available.` });
      } else {
        toast({ title: "Key rejected", description: data?.error || "Unknown error", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTesting(null);
    }
  };

  const saveKey = async (provider: Provider) => {
    const key = drafts[provider].trim();
    if (!key) { toast({ title: "Paste an API key first", variant: "destructive" }); return; }
    setSaving(provider);
    try {
      const existing = configs[provider];
      const payload: any = {
        provider,
        api_key: key,
        default_model: existing.default_model,
        is_active: true,
        monthly_budget_usd: existing.monthly_budget_usd,
      };
      // org_id is set by trigger? No — we need it explicitly. Fetch from profile.
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("user_id", user!.id).single();
      payload.org_id = profile?.org_id;

      if (existing.id) {
        const { error } = await supabase.from("ai_provider_configs").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ai_provider_configs").insert(payload);
        if (error) throw error;
      }
      setDrafts({ ...drafts, [provider]: "" });
      toast({ title: "Saved ✓", description: `${provider} key stored securely.` });
      load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const updateMeta = async (provider: Provider, patch: Partial<Config>) => {
    const existing = configs[provider];
    if (!existing.id) {
      setConfigs({ ...configs, [provider]: { ...existing, ...patch } });
      return;
    }
    const { error } = await supabase
      .from("ai_provider_configs")
      .update({
        default_model: patch.default_model ?? existing.default_model,
        is_active: patch.is_active ?? existing.is_active,
        monthly_budget_usd: patch.monthly_budget_usd ?? existing.monthly_budget_usd,
      })
      .eq("id", existing.id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    setConfigs({ ...configs, [provider]: { ...existing, ...patch } });
  };

  const removeKey = async (provider: Provider) => {
    const existing = configs[provider];
    if (!existing.id) return;
    if (!confirm(`Remove ${provider} API key?`)) return;
    const { error } = await supabase.from("ai_provider_configs").delete().eq("id", existing.id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Removed" });
    load();
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> AI Providers</h2>
        <p className="text-sm text-muted-foreground">Connect your own OpenAI, Claude, or Gemini API keys. Lovable AI is always available as a free fallback — no key needed.</p>
      </div>

      {PROVIDERS.map((p) => {
        const cfg = configs[p.id];
        if (!cfg) return null;
        const usagePct = cfg.monthly_budget_usd > 0 ? Math.min(100, Math.round((cfg.usage_this_month_usd / cfg.monthly_budget_usd) * 100)) : 0;
        return (
          <Card key={p.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <KeyRound className="h-4 w-4" /> {p.name}
                    {cfg.has_key ? (
                      <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Connected</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1"><XCircle className="h-3 w-3 text-muted-foreground" /> Not configured</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-1">
                    <a href={p.keyUrl} target="_blank" rel="noreferrer" className="text-xs underline inline-flex items-center gap-1">
                      Get your API key <ExternalLink className="h-3 w-3" />
                    </a>
                  </CardDescription>
                </div>
                {cfg.has_key && (
                  <div className="flex items-center gap-2">
                    <Switch checked={cfg.is_active} onCheckedChange={(v) => updateMeta(p.id, { is_active: v })} />
                    <Button variant="ghost" size="icon" onClick={() => removeKey(p.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
                <div>
                  <Label className="text-xs">{cfg.has_key ? "Replace API key" : "API key"}</Label>
                  <Input
                    type="password"
                    placeholder={p.placeholder}
                    value={drafts[p.id]}
                    onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value })}
                  />
                </div>
                <Button variant="outline" onClick={() => testKey(p.id)} disabled={testing === p.id || !drafts[p.id].trim()}>
                  {testing === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
                </Button>
                <Button onClick={() => saveKey(p.id)} disabled={saving === p.id || !drafts[p.id].trim()}>
                  {saving === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Default model</Label>
                  <Select value={cfg.default_model ?? p.defaultModel} onValueChange={(v) => updateMeta(p.id, { default_model: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {p.modelOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Monthly budget (USD)</Label>
                  <Input
                    type="number" min={0} step={1}
                    value={cfg.monthly_budget_usd}
                    onChange={(e) => updateMeta(p.id, { monthly_budget_usd: Number(e.target.value) || 0 })}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Used this month: ${cfg.usage_this_month_usd.toFixed(2)} ({usagePct}%)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Lovable AI (Built-in Fallback)</CardTitle>
          <CardDescription>Always available. No key required. Uses your Lovable workspace credits. Best for trying things before you commit to a paid provider.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
