import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Sparkles, Wand2, Loader2, RefreshCw, CheckCircle2, AlertCircle,
  Users, Target, MessageSquare, Zap, ChevronRight, Send, Megaphone,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

type Draft = {
  id: string;
  client_id: string;
  ad_account_id: string;
  platform: string;
  status: string;
  product_brief: string;
  product_url: string | null;
  research_json: any | null;
  draft_json: any | null;
  version: number;
  error: string | null;
};

export default function AICampaignBuilder() {
  const { user, authReady } = useAuth();
  const { profile } = useProfile();
  const qc = useQueryClient();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>(() => localStorage.getItem("aicb:lastClientId") || "");
  const [adAccountId, setAdAccountId] = useState<string>(() => localStorage.getItem("aicb:lastAdAccountId") || "");
  const [objective, setObjective] = useState<string>(() => localStorage.getItem("aicb:lastObjective") || "");
  const [productName, setProductName] = useState<string>(() => localStorage.getItem("aicb:lastProductName") || "");
  const [productBrief, setProductBrief] = useState("");
  const [productUrl, setProductUrl] = useState("");

  useEffect(() => { if (clientId) localStorage.setItem("aicb:lastClientId", clientId); }, [clientId]);
  useEffect(() => { if (adAccountId) localStorage.setItem("aicb:lastAdAccountId", adAccountId); }, [adAccountId]);
  useEffect(() => { if (objective) localStorage.setItem("aicb:lastObjective", objective); }, [objective]);
  useEffect(() => { if (productName) localStorage.setItem("aicb:lastProductName", productName); }, [productName]);

  // Clients (role='client' only, keyed by auth user_id — same key used in ad_account_clients.client_id)
  const clientsQ = useQuery({
    queryKey: ["aicb-clients"],
    enabled: authReady && !!user,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "client");
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, business_name")
        .in("user_id", ids)
        .order("business_name", { ascending: true });
      return data ?? [];
    },
  });

  // Ad accounts filtered by selected client (client_id stores auth user_id)
  const accountsQ = useQuery({
    queryKey: ["aicb-accounts", clientId],
    enabled: authReady && !!user && !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ad_account_clients")
        .select("ad_account:ad_accounts(id, account_name, platform_name, account_currency)")
        .eq("client_id", clientId);
      const accounts = (data ?? []).map((r: any) => r.ad_account).filter(Boolean);
      const seen = new Set<string>();
      return accounts.filter((a: any) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
    },
  });

  // Current draft
  const draftQ = useQuery<Draft | null>({
    queryKey: ["aicb-draft", draftId],
    enabled: !!draftId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_campaign_drafts").select("*").eq("id", draftId!).maybeSingle();
      return data as any;
    },
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status;
      return s === "researching" || s === "publishing" ? 1500 : false;
    },
  });

  const recentQ = useQuery({
    queryKey: ["aicb-recent"],
    enabled: authReady && !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_campaign_drafts")
        .select("id, status, product_brief, created_at, platform")
        .order("created_at", { ascending: false }).limit(10);
      return data ?? [];
    },
  });

  // Create + kick research
  const startMutation = useMutation({
    mutationFn: async () => {
      if (!clientId || !adAccountId) throw new Error("Select client and ad account");
      if (!objective) throw new Error("Select a campaign objective");
      if (!productName.trim()) throw new Error("Enter the product / offer name");
      if (!productBrief.trim()) throw new Error("Describe the product first");
      const acc = accountsQ.data?.find((a: any) => a.id === adAccountId);
      const { data: ins, error } = await supabase.from("ai_campaign_drafts").insert({
        user_id: user!.id,
        client_id: clientId,
        ad_account_id: adAccountId,
        platform: (acc?.platform_name ?? "meta") as any,
        product_brief: productBrief,
        product_url: productUrl || null,
        objective,
        product_name: productName.trim(),
        status: "researching",
        org_id: (profile as any)?.org_id ?? null,
      } as any).select("id").single();
      if (error) throw error;
      const draft_id = ins.id;
      setDraftId(draft_id);
      const { error: rErr } = await supabase.functions.invoke("ai-campaign-research", { body: { draft_id } });
      if (rErr) throw rErr;
      // After research completes (polled), kick generate
      return draft_id;
    },
    onError: (e: any) => toast.error(e.message || "Failed to start"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["aicb-recent"] }); },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!draftId) return;
      const { error } = await supabase.functions.invoke("ai-campaign-generate", { body: { draft_id: draftId } });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aicb-draft", draftId] }),
    onError: (e: any) => toast.error(e.message || "Generation failed"),
  });

  // Auto-trigger generate when research completes (status becomes 'draft')
  useEffect(() => {
    const d = draftQ.data;
    if (d && d.research_json && !d.draft_json && d.status === "draft" && !generateMutation.isPending) {
      generateMutation.mutate();
    }
  }, [draftQ.data?.status, draftQ.data?.research_json, draftQ.data?.draft_json]);

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!draftId || !draftQ.data) return;
      const { error } = await supabase.from("ai_campaign_drafts")
        .update({ status: "approved" }).eq("id", draftId);
      if (error) throw error;
      // Queue a pending action — the publisher will pick it up.
      await supabase.from("ai_pending_actions").insert({
        org_id: (draftQ.data as any).org_id,
        user_id: user!.id,
        tool_name: "campaign.publish_draft",
        args: { draft_id: draftId, ad_account_id: draftQ.data.ad_account_id, client_id: draftQ.data.client_id },
        summary: `Publish AI draft to ${draftQ.data.platform}`,
      });
    },
    onSuccess: () => {
      toast.success("Approved & queued for publishing");
      qc.invalidateQueries({ queryKey: ["aicb-draft", draftId] });
    },
    onError: (e: any) => toast.error(e.message || "Approval failed"),
  });

  const draft = draftQ.data;
  const isWorking = draft?.status === "researching" || generateMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Campaign Architect"
        subtitle="Describe a product. Get a launch-ready campaign in under 2 minutes."
        icon={<Sparkles className="h-5 w-5 text-primary" />}
      />

      {!draftId && (
        <SetupCard
          clients={clientsQ.data ?? []}
          clientsLoading={clientsQ.isLoading}
          accounts={accountsQ.data ?? []}
          accountsLoading={accountsQ.isLoading}
          clientId={clientId} setClientId={(v) => { setClientId(v); setAdAccountId(""); }}
          adAccountId={adAccountId} setAdAccountId={setAdAccountId}
          productBrief={productBrief} setProductBrief={setProductBrief}
          productUrl={productUrl} setProductUrl={setProductUrl}
          onStart={() => startMutation.mutate()}
          starting={startMutation.isPending}
          recent={recentQ.data ?? []}
          onOpen={(id) => setDraftId(id)}
        />
      )}

      {draftId && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4">
            <ResearchPanel draft={draft} working={isWorking} />
            <Button variant="outline" className="w-full" onClick={() => { setDraftId(null); }}>
              ← Start a new draft
            </Button>
          </div>
          <div className="lg:col-span-8 space-y-4">
            <DraftTreePanel
              draft={draft}
              working={isWorking}
              onRegenerate={() => generateMutation.mutate()}
              onApprove={() => approveMutation.mutate()}
              approving={approveMutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

function SetupCard(props: any) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 p-6 space-y-5 ios-glass">
        <div className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">New AI campaign</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Client</label>
            <Select value={props.clientId} onValueChange={props.setClientId}>
              <SelectTrigger><SelectValue placeholder={props.clientsLoading ? "Loading clients…" : "Select client…"} /></SelectTrigger>
              <SelectContent>
                {props.clients.length === 0 && !props.clientsLoading && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No clients found.</div>
                )}
                {props.clients.map((c: any) => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.business_name || c.full_name || "Unnamed"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Ad account</label>
            <Select value={props.adAccountId} onValueChange={props.setAdAccountId} disabled={!props.clientId}>
              <SelectTrigger><SelectValue placeholder={!props.clientId ? "Select client first" : props.accountsLoading ? "Loading…" : props.accounts.length === 0 ? "No ad accounts mapped" : "Select ad account…"} /></SelectTrigger>
              <SelectContent>
                {props.accounts.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.account_name} · {a.platform_name?.toUpperCase()} · {a.account_currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {props.clientId && !props.accountsLoading && props.accounts.length === 0 && (
              <p className="text-xs text-muted-foreground">No ad accounts mapped to this client. Map one in Client → Ad Accounts.</p>
            )}
          </div>

        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Product brief</label>
          <Textarea
            rows={6}
            placeholder="Describe the product: what it is, who it's for, key features, price, USP, anything special…"
            value={props.productBrief}
            onChange={(e) => props.setProductBrief(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Product URL (optional)</label>
          <Input placeholder="https://…" value={props.productUrl} onChange={(e) => props.setProductUrl(e.target.value)} />
        </div>
        <Button
          size="lg"
          className="w-full gap-2"
          disabled={props.starting || !props.clientId || !props.adAccountId || !props.productBrief.trim()}
          onClick={props.onStart}
        >
          {props.starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Research & draft campaign
        </Button>
      </Card>

      <Card className="p-6 ios-glass">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Recent drafts</h3>
        <div className="space-y-2">
          {props.recent.length === 0 && <p className="text-sm text-muted-foreground">No drafts yet.</p>}
          {props.recent.map((r: any) => (
            <button
              key={r.id}
              onClick={() => props.onOpen(r.id)}
              className="w-full text-left p-3 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-accent/30 transition"
            >
              <div className="flex items-center justify-between mb-1">
                <Badge variant="outline" className="text-xs">{r.platform?.toUpperCase()}</Badge>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-sm line-clamp-2">{r.product_brief || "(no brief)"}</p>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    researching: "bg-blue-500/15 text-blue-500",
    ready: "bg-emerald-500/15 text-emerald-500",
    approved: "bg-amber-500/15 text-amber-500",
    publishing: "bg-amber-500/15 text-amber-500",
    published: "bg-emerald-500/15 text-emerald-500",
    failed: "bg-destructive/15 text-destructive",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${map[status] ?? "bg-muted"}`}>{status}</span>;
}

// ─────────────────────────────────────────────────────────────

function ResearchPanel({ draft, working }: { draft: Draft | null | undefined; working: boolean }) {
  if (!draft) return <Card className="p-6"><Skeleton className="h-24" /></Card>;
  const r = draft.research_json;

  return (
    <Card className="p-5 ios-glass space-y-4">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Deep research</h3>
        <StatusBadge status={draft.status} />
      </div>

      {draft.error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{draft.error}</span>
        </div>
      )}

      {!r && working && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Researching product, audience, angles, competitors…
          </p>
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      )}

      {r && (
        <div className="space-y-4 text-sm">
          <Section label="Product"><p>{r.product_summary}</p></Section>
          {r.usp && <Section label="USP"><p className="font-medium text-primary">{r.usp}</p></Section>}
          {r.target_personas?.length > 0 && (
            <Section label="Personas">
              <div className="space-y-2">
                {r.target_personas.slice(0, 3).map((p: any, i: number) => (
                  <div key={i} className="p-2 rounded border border-border/50">
                    <div className="font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground">{p.age_range} · {p.gender}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(p.interests || []).slice(0,4).map((x: string) => (
                        <Badge key={x} variant="secondary" className="text-[10px]">{x}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {r.angles?.length > 0 && (
            <Section label="Angles">
              <div className="space-y-1.5">
                {r.angles.map((a: any, i: number) => (
                  <div key={i} className="text-xs">
                    <span className="font-semibold">{i+1}. {a.name}</span>
                    <span className="text-muted-foreground"> — {a.short_hook}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {r.platform_fit && (
            <Section label="Platform fit">
              <p className="text-xs">
                <strong>{r.platform_fit.best_platform?.toUpperCase()}</strong> · {r.platform_fit.best_format}
                <br /><span className="text-muted-foreground">{r.platform_fit.reasoning}</span>
              </p>
            </Section>
          )}
        </div>
      )}
    </Card>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

function DraftTreePanel({ draft, working, onRegenerate, onApprove, approving }: any) {
  if (!draft) return <Card className="p-6"><Skeleton className="h-64" /></Card>;
  const tree = draft.draft_json;

  if (!tree) {
    return (
      <Card className="p-8 ios-glass text-center">
        {working ? (
          <div className="space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Architecting your campaign…</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Waiting for research to complete.</p>
        )}
      </Card>
    );
  }

  const c = tree.campaign;
  return (
    <Card className="p-5 ios-glass space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Draft campaign</h3>
          <Badge variant="outline" className="text-xs">v{draft.version}</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onRegenerate} disabled={working}>
            <RefreshCw className={`h-3 w-3 mr-1 ${working ? "animate-spin" : ""}`} /> Regenerate
          </Button>
          <Button
            size="sm"
            onClick={onApprove}
            disabled={approving || draft.status === "approved" || draft.status === "published"}
            className="gap-1"
          >
            {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            {draft.status === "approved" || draft.status === "published" ? "Approved" : "Approve & queue"}
          </Button>
        </div>
      </div>

      {tree.rationale && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
          <Zap className="h-3 w-3 inline mr-1 text-primary" />
          {tree.rationale}
        </div>
      )}

      <div className="space-y-3">
        <div className="p-4 rounded-xl border border-border/50 bg-card/30">
          <div className="flex items-center gap-2 mb-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campaign</span>
          </div>
          <div className="font-mono text-sm font-medium">{c.name}</div>
          <div className="flex flex-wrap gap-2 mt-2 text-xs">
            <Badge>{c.objective}</Badge>
            <Badge variant="outline">{c.daily_budget}/day</Badge>
            {c.buying_type && <Badge variant="outline">{c.buying_type}</Badge>}
          </div>
        </div>

        {tree.ad_sets?.map((as: any, i: number) => (
          <div key={i} className="ml-4 pl-4 border-l-2 border-border/50 space-y-3">
            <div className="p-3 rounded-lg border border-border/50 bg-card/20">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ad Set</span>
              </div>
              <div className="font-mono text-sm">{as.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {as.audience?.countries?.join(", ")} · {as.audience?.age_min}-{as.audience?.age_max} · {as.audience?.gender} · {as.placements}
              </div>
              {as.audience?.interests?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {as.audience.interests.slice(0, 6).map((it: string) => (
                    <Badge key={it} variant="secondary" className="text-[10px]">{it}</Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="ml-4 pl-4 border-l-2 border-border/30 space-y-2">
              {as.ads?.map((ad: any, j: number) => (
                <div key={j} className="p-3 rounded-lg border border-border/50 bg-card/10">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <MessageSquare className="h-3 w-3 text-primary" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ad</span>
                    <Badge variant="outline" className="text-[10px]">{ad.format}</Badge>
                    <Badge variant="outline" className="text-[10px]">{ad.cta}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{ad.angle_used}</Badge>
                  </div>
                  <div className="font-mono text-xs mb-2">{ad.name}</div>
                  {ad.primary_texts?.[0] && (
                    <p className="text-sm leading-snug mb-2">{ad.primary_texts[0]}</p>
                  )}
                  {ad.headlines?.[0] && (
                    <p className="text-sm font-semibold">{ad.headlines[0]}</p>
                  )}
                  {ad.headlines?.length > 1 && (
                    <details className="mt-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer hover:text-foreground">+ {ad.headlines.length - 1} more headlines, {(ad.primary_texts?.length ?? 1) - 1} more texts</summary>
                      <div className="mt-2 space-y-1 pl-3 border-l border-border/30">
                        {ad.primary_texts?.slice(1).map((t: string, k: number) => <p key={`p${k}`}>· {t}</p>)}
                        {ad.headlines?.slice(1).map((t: string, k: number) => <p key={`h${k}`} className="font-medium">· {t}</p>)}
                      </div>
                    </details>
                  )}
                  {ad.creative_brief && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Creative brief</summary>
                      <p className="mt-1 text-muted-foreground">{ad.creative_brief}</p>
                    </details>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-2 truncate">→ {ad.destination_url}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {draft.status === "approved" && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 text-sm flex items-center gap-2">
          <Send className="h-4 w-4" />
          Queued for publishing. The platform publisher will pick this up.
        </div>
      )}
    </Card>
  );
}
