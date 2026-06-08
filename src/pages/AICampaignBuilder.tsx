import { useState, useEffect, useRef } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Sparkles, Wand2, Loader2, RefreshCw, CheckCircle2, AlertCircle,
  Users, Target, MessageSquare, Zap, Send, Megaphone, Brain,
  TrendingUp, Globe, DollarSign, ShieldCheck, BookOpen, History,
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
  past_performance_json: any | null;
  strategy_json: any | null;
  agent_stage: string | null;
  agent_log: any[];
  version: number;
  error: string | null;
};

const STAGES = [
  { key: "scraping", label: "Scrape", icon: Globe },
  { key: "learning", label: "Learn", icon: History },
  { key: "strategizing", label: "Strategize", icon: Brain },
  { key: "drafting", label: "Draft", icon: Wand2 },
  { key: "critiquing", label: "Self-review", icon: ShieldCheck },
];

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

  const clientsQ = useQuery({
    queryKey: ["aicb-clients"],
    enabled: authReady && !!user,
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles")
        .select("user_id, full_name, business_name")
        .in("user_id", ids)
        .order("business_name", { ascending: true });
      return data ?? [];
    },
  });

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

  const draftQ = useQuery<Draft | null>({
    queryKey: ["aicb-draft", draftId],
    enabled: !!draftId,
    queryFn: async () => {
      const { data } = await supabase.from("ai_campaign_drafts").select("*").eq("id", draftId!).maybeSingle();
      return data as any;
    },
    refetchInterval: (q) => {
      const d: any = q.state.data;
      if (!d) return 1500;
      const inFlight = ["researching", "publishing"].includes(d.status)
        || (d.agent_stage && !["ready", "failed"].includes(d.agent_stage));
      return inFlight ? 1500 : false;
    },
  });

  const recentQ = useQuery({
    queryKey: ["aicb-recent"],
    enabled: authReady && !!user,
    queryFn: async () => {
      const { data } = await supabase.from("ai_campaign_drafts")
        .select("id, status, product_brief, created_at, platform, agent_stage")
        .order("created_at", { ascending: false }).limit(10);
      return data ?? [];
    },
  });

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
      const { error: aErr } = await supabase.functions.invoke("ai-campaign-agent", { body: { draft_id } });
      if (aErr) throw aErr;
      return draft_id;
    },
    onError: (e: any) => toast.error(e.message || "Failed to start"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aicb-recent"] }),
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      if (!draftId) return;
      const { error } = await supabase.functions.invoke("ai-campaign-agent", { body: { draft_id: draftId } });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aicb-draft", draftId] }),
    onError: (e: any) => toast.error(e.message || "Regeneration failed"),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!draftId || !draftQ.data) return;
      const { error: upErr } = await supabase.from("ai_campaign_drafts").update({ status: "approved" }).eq("id", draftId);
      if (upErr) throw upErr;
      const { data, error } = await supabase.functions.invoke("ai-campaign-publish", { body: { draft_id: draftId } });
      if (error) throw new Error(error.message || "Publish failed");
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      const adSetsCount = data?.publish_result?.ad_sets?.length ?? 0;
      const needsCreative = data?.publish_result?.ads?.length ?? 0;
      toast.success(
        `Published to ad account: 1 campaign + ${adSetsCount} ad set${adSetsCount === 1 ? "" : "s"} (paused).` +
        (needsCreative ? ` ${needsCreative} ad${needsCreative === 1 ? "" : "s"} need creative upload in Ads Manager.` : "")
      );
      qc.invalidateQueries({ queryKey: ["aicb-draft", draftId] });
    },
    onError: (e: any) => toast.error(e.message || "Publish failed"),
  });

  const draft = draftQ.data;
  const working = draft && draft.agent_stage && !["ready", "failed"].includes(draft.agent_stage);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Campaign Architect"
        subtitle="A 5-stage agent: scrape → learn → strategize → draft → self-review."
        icon={<Sparkles className="h-5 w-5 text-primary" />}
      />

      {!draftId && (
        <SetupCard
          clients={clientsQ.data ?? []}
          clientsLoading={clientsQ.isLoading}
          accounts={accountsQ.data ?? []}
          accountsLoading={accountsQ.isLoading}
          clientId={clientId} setClientId={(v: string) => { setClientId(v); setAdAccountId(""); }}
          adAccountId={adAccountId} setAdAccountId={setAdAccountId}
          objective={objective} setObjective={setObjective}
          productName={productName} setProductName={setProductName}
          productBrief={productBrief} setProductBrief={setProductBrief}
          productUrl={productUrl} setProductUrl={setProductUrl}
          onStart={() => startMutation.mutate()}
          starting={startMutation.isPending}
          recent={recentQ.data ?? []}
          onOpen={(id: string) => setDraftId(id)}
        />
      )}

      {draftId && (
        <>
          <StageStepper draft={draft} working={!!working} />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-4">
              <PastPerformancePanel draft={draft} />
              <StrategyPanel draft={draft} />
              <CritiquePanel draft={draft} />
              <Button variant="outline" className="w-full" onClick={() => setDraftId(null)}>
                ← Start a new draft
              </Button>
            </div>
            <div className="lg:col-span-5 space-y-4">
              <DraftTreePanel
                draft={draft}
                working={!!working}
                onRegenerate={() => regenerateMutation.mutate()}
                onApprove={() => approveMutation.mutate()}
                approving={approveMutation.isPending}
              />
            </div>
            <div className="lg:col-span-3 space-y-4">
              <RefineChat draftId={draftId} disabled={!draft?.draft_json || !!working} onChanged={() => qc.invalidateQueries({ queryKey: ["aicb-draft", draftId] })} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────── Setup ─────────────────────────

function SetupCard(props: any) {
  const OBJECTIVES = ["SALES", "LEADS", "TRAFFIC", "MESSAGES", "AWARENESS", "APP_INSTALLS"];
  const datestamp = (() => { const t = new Date(); return `${String(t.getFullYear()).slice(2)}${String(t.getMonth()+1).padStart(2,"0")}${String(t.getDate()).padStart(2,"0")}`; })();
  const selectedClient = props.clients.find((c: any) => c.user_id === props.clientId);
  const keyword = (selectedClient?.business_name || selectedClient?.full_name || "client").trim();
  const product = (props.productName || "{product}").trim();
  const obj = props.objective || "{OBJECTIVE}";
  const namePreview = `${keyword} | ${product} | ${obj} | ${datestamp}`;
  const ready = props.clientId && props.adAccountId && props.objective && props.productName.trim() && props.productBrief.trim();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 p-6 space-y-5 ios-glass">
        <div className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">New AI campaign</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Client</label>
            <Select value={props.clientId} onValueChange={props.setClientId}>
              <SelectTrigger><SelectValue placeholder={props.clientsLoading ? "Loading clients…" : "Select client…"} /></SelectTrigger>
              <SelectContent>
                {props.clients.length === 0 && !props.clientsLoading && <div className="px-3 py-2 text-sm text-muted-foreground">No clients found.</div>}
                {props.clients.map((c: any) => <SelectItem key={c.user_id} value={c.user_id}>{c.business_name || c.full_name || "Unnamed"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Ad account</label>
            <Select value={props.adAccountId} onValueChange={props.setAdAccountId} disabled={!props.clientId}>
              <SelectTrigger><SelectValue placeholder={!props.clientId ? "Select client first" : props.accountsLoading ? "Loading…" : props.accounts.length === 0 ? "No ad accounts mapped" : "Select ad account…"} /></SelectTrigger>
              <SelectContent>
                {props.accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.account_name} · {a.platform_name?.toUpperCase()} · {a.account_currency}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Objective</label>
            <Select value={props.objective} onValueChange={props.setObjective}>
              <SelectTrigger><SelectValue placeholder="Select objective…" /></SelectTrigger>
              <SelectContent>{OBJECTIVES.map((o) => <SelectItem key={o} value={o}>{o.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Product / Offer name</label>
            <Input placeholder="e.g. Premium Honey 500g" value={props.productName} onChange={(e) => props.setProductName(e.target.value)} />
          </div>
        </div>
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Campaign name preview</div>
          <code className="text-xs break-all">{namePreview}</code>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Product brief</label>
          <Textarea rows={6} placeholder="Describe the product: what it is, who it's for, key features, price, USP…" value={props.productBrief} onChange={(e) => props.setProductBrief(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Product URL (optional — agent will scrape it)</label>
          <Input placeholder="https://…" value={props.productUrl} onChange={(e) => props.setProductUrl(e.target.value)} />
        </div>
        <Button size="lg" className="w-full gap-2" disabled={props.starting || !ready} onClick={props.onStart}>
          {props.starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Run 5-stage AI agent
        </Button>
      </Card>

      <Card className="p-6 ios-glass">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Recent drafts</h3>
        <div className="space-y-2">
          {props.recent.length === 0 && <p className="text-sm text-muted-foreground">No drafts yet.</p>}
          {props.recent.map((r: any) => (
            <button key={r.id} onClick={() => props.onOpen(r.id)} className="w-full text-left p-3 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-accent/30 transition">
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

// ───────────────────────── Stepper ─────────────────────────

function StageStepper({ draft, working }: { draft: Draft | null | undefined; working: boolean }) {
  const stage = draft?.agent_stage ?? null;
  const stageIndex = STAGES.findIndex((s) => s.key === stage);
  const log = Array.isArray(draft?.agent_log) ? draft!.agent_log : [];
  const lastLog = log[log.length - 1];

  return (
    <Card className="p-4 ios-glass">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const active = stage === s.key;
          const done = stage === "ready" || (stageIndex > i && stageIndex >= 0);
          return (
            <div key={s.key} className="flex items-center gap-2 shrink-0">
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border ${
                active ? "bg-primary/15 border-primary/40 text-primary" :
                done ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600" :
                "bg-muted/30 border-border/40 text-muted-foreground"
              }`}>
                {active && working ? <Loader2 className="h-3 w-3 animate-spin" /> :
                 done ? <CheckCircle2 className="h-3 w-3" /> :
                 <Icon className="h-3 w-3" />}
                {s.label}
              </div>
              {i < STAGES.length - 1 && <div className={`h-px w-4 ${done ? "bg-emerald-500/40" : "bg-border/40"}`} />}
            </div>
          );
        })}
        <div className="ml-auto text-xs text-muted-foreground truncate max-w-[40%]">{lastLog?.summary || (working ? "Working…" : "")}</div>
      </div>
      {draft?.error && (
        <div className="mt-2 flex items-start gap-2 p-2 rounded bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5" /> {draft.error}
        </div>
      )}
    </Card>
  );
}

// ───────────────────────── Past Performance ─────────────────────────

function PastPerformancePanel({ draft }: { draft: Draft | null | undefined }) {
  if (!draft) return <Card className="p-5 ios-glass"><Skeleton className="h-32" /></Card>;
  const past: any = draft.past_performance_json;
  return (
    <Card className="p-5 ios-glass space-y-3">
      <div className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /><h3 className="font-semibold text-sm">What we learned from this client</h3></div>
      {!past && <p className="text-xs text-muted-foreground">Pending learning stage…</p>}
      {past && past.total_campaigns === 0 && <p className="text-xs text-muted-foreground">No past campaigns yet — agent will use best-practice defaults.</p>}
      {past && past.total_campaigns > 0 && (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Campaigns" value={past.total_campaigns} />
            <Stat label="Avg CPA" value={past.avg_cpa != null ? past.avg_cpa.toFixed(2) : "—"} />
            <Stat label="Avg ROAS" value={past.avg_roas != null ? `${past.avg_roas.toFixed(2)}×` : "—"} />
          </div>
          {past.top_angles?.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Top performers</div>
              <ul className="space-y-1">
                {past.top_angles.slice(0, 4).map((a: any, i: number) => (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <span className="truncate">{a.name}</span>
                    <span className="shrink-0 text-emerald-600 font-mono">{a.roas != null ? `${a.roas}×` : "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="p-2 rounded border border-border/50">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold text-sm">{value}</div>
    </div>
  );
}

// ───────────────────────── Strategy + Smart Budget ─────────────────────────

function StrategyPanel({ draft }: { draft: Draft | null | undefined }) {
  if (!draft) return null;
  const s: any = draft.strategy_json;
  if (!s) return (
    <Card className="p-5 ios-glass">
      <div className="flex items-center gap-2 mb-2"><Brain className="h-4 w-4 text-primary" /><h3 className="font-semibold text-sm">Strategy brief</h3></div>
      <p className="text-xs text-muted-foreground">Pending strategy stage…</p>
    </Card>
  );

  return (
    <Card className="p-5 ios-glass space-y-3">
      <div className="flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /><h3 className="font-semibold text-sm">Strategy brief</h3></div>
      {s.usp && <div className="text-xs"><span className="text-muted-foreground">USP:</span> <span className="font-medium text-primary">{s.usp}</span></div>}

      {s.recommended_budget && (
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <DollarSign className="h-3 w-3" /> Smart budget
          </div>
          <div className="text-lg font-semibold">{s.recommended_budget.daily} <span className="text-xs text-muted-foreground font-normal">/ day</span></div>
          <div className="text-[11px] text-muted-foreground">{s.recommended_budget.bid_strategy}</div>
          {s.recommended_budget.justification && (
            <div className="text-[11px] text-muted-foreground italic">{s.recommended_budget.justification}</div>
          )}
        </div>
      )}

      {s.target_personas?.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Personas</div>
          {s.target_personas.slice(0, 2).map((p: any, i: number) => (
            <div key={i} className="text-xs p-2 rounded border border-border/40">
              <div className="font-medium">{p.label}</div>
              <div className="text-muted-foreground">{p.age_range} · {p.gender}</div>
              <div className="flex flex-wrap gap-1 mt-1">{(p.interests ?? []).slice(0, 4).map((x: string) => <Badge key={x} variant="secondary" className="text-[10px]">{x}</Badge>)}</div>
            </div>
          ))}
        </div>
      )}

      {s.angles?.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Angles</div>
          <ul className="space-y-1 text-xs">
            {s.angles.slice(0, 5).map((a: any, i: number) => (
              <li key={i}><span className="font-semibold">{i + 1}. {a.name}</span> <span className="text-muted-foreground">— {a.short_hook}</span></li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ───────────────────────── Critique ─────────────────────────

function CritiquePanel({ draft }: { draft: Draft | null | undefined }) {
  const c: any = (draft?.strategy_json as any)?.critique;
  if (!c) return null;
  return (
    <Card className="p-5 ios-glass space-y-2">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h3 className="font-semibold text-sm">AI self-review</h3></div>
      {c.summary && <p className="text-xs text-muted-foreground italic">{c.summary}</p>}
      {Array.isArray(c.issues_found) && c.issues_found.length > 0 && (
        <ul className="space-y-1 text-xs">
          {c.issues_found.map((it: string, i: number) => (
            <li key={i} className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" /><span>{it}</span></li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ───────────────────────── Refine Chat ─────────────────────────

function RefineChat({ draftId, disabled, onChanged }: { draftId: string | null; disabled: boolean; onChanged: () => void }) {
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function send() {
    const text = input.trim();
    if (!text || !draftId) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-campaign-refine", { body: { draft_id: draftId, instruction: text } });
      if (error) throw error;
      setMessages((m) => [...m, { role: "ai", text: (data as any)?.change_summary || "Updated the draft." }]);
      onChanged();
    } catch (e: any) {
      setMessages((m) => [...m, { role: "ai", text: `⚠️ ${e.message ?? "Refine failed"}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 ios-glass flex flex-col h-[600px]">
      <div className="flex items-center gap-2 mb-3"><MessageSquare className="h-4 w-4 text-primary" /><h3 className="font-semibold text-sm">Refine with chat</h3></div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground space-y-1.5">
            <p>Tell the AI what to change. Examples:</p>
            <ul className="space-y-1 pl-3">
              <li>• "Make audience younger (18-28)"</li>
              <li>• "Add a flash-sale discount angle"</li>
              <li>• "Rewrite hooks more aggressive"</li>
              <li>• "Split-test 2 daily budgets"</li>
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-xs rounded-lg px-2.5 py-1.5 ${m.role === "user" ? "bg-primary/10 ml-6" : "bg-muted/40 mr-6"}`}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{m.role === "user" ? "You" : "AI"}</div>
            {m.text}
          </div>
        ))}
        {busy && <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Revising draft…</div>}
        <div ref={endRef} />
      </div>
      <div className="flex gap-1.5 mt-2">
        <Textarea
          rows={2}
          placeholder={disabled ? "Wait for draft to be ready…" : "Tell the AI what to change…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled || busy}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          className="resize-none text-xs"
        />
        <Button size="icon" onClick={send} disabled={disabled || busy || !input.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </Card>
  );
}

// ───────────────────────── Draft Tree (platform-aware) ─────────────────────────

function DraftTreePanel({ draft, working, onRegenerate, onApprove, approving }: any) {
  if (!draft) return <Card className="p-6 ios-glass"><Skeleton className="h-64" /></Card>;
  const tree = draft.draft_json;
  const platform = (draft.platform || "meta").toLowerCase();

  if (!tree) {
    return (
      <Card className="p-8 ios-glass text-center">
        {working ? (
          <div className="space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Agent is working…</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{draft.error ?? "Waiting for agent…"}</p>
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
          <Badge variant="outline" className="text-xs">{platform.toUpperCase()}</Badge>
          <Badge variant="outline" className="text-xs">v{draft.version}</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onRegenerate} disabled={working}>
            <RefreshCw className={`h-3 w-3 mr-1 ${working ? "animate-spin" : ""}`} /> Re-run agent
          </Button>
          <Button size="sm" onClick={onApprove} disabled={approving || draft.status === "approved" || draft.status === "published"} className="gap-1">
            {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            {draft.status === "approved" || draft.status === "published" ? "Approved" : "Approve & queue"}
          </Button>
        </div>
      </div>

      {tree.rationale && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
          <Zap className="h-3 w-3 inline mr-1 text-primary" />{tree.rationale}
        </div>
      )}

      <div className="p-4 rounded-xl border border-border/50 bg-card/30">
        <div className="flex items-center gap-2 mb-2"><Megaphone className="h-4 w-4 text-primary" /><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campaign</span></div>
        <div className="font-mono text-sm font-medium">{c?.name}</div>
        <div className="flex flex-wrap gap-2 mt-2 text-xs">
          {c?.objective && <Badge>{c.objective}</Badge>}
          {c?.type && <Badge variant="outline">{c.type}</Badge>}
          {c?.daily_budget != null && <Badge variant="outline">{c.daily_budget}/day</Badge>}
          {c?.bidding_strategy && <Badge variant="outline">{c.bidding_strategy}</Badge>}
        </div>
      </div>

      {platform === "tiktok" ? <TikTokTree tree={tree} /> :
       platform === "google" ? <GoogleTree tree={tree} /> :
       <MetaTree tree={tree} />}

      {draft.status === "approved" && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 text-sm flex items-center gap-2">
          <Send className="h-4 w-4" /> Queued for publishing.
        </div>
      )}
    </Card>
  );
}

function MetaTree({ tree }: { tree: any }) {
  return (
    <div className="space-y-3">
      {tree.ad_sets?.map((as: any, i: number) => (
        <div key={i} className="ml-4 pl-4 border-l-2 border-border/50 space-y-3">
          <div className="p-3 rounded-lg border border-border/50 bg-card/20">
            <div className="flex items-center gap-2 mb-1"><Users className="h-3 w-3 text-primary" /><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ad Set</span></div>
            <div className="font-mono text-sm">{as.name}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {as.audience?.countries?.join(", ")} · {as.audience?.age_min}-{as.audience?.age_max} · {as.audience?.gender} · {as.placements}
            </div>
            {as.audience?.interests?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">{as.audience.interests.slice(0, 8).map((it: string) => <Badge key={it} variant="secondary" className="text-[10px]">{it}</Badge>)}</div>
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
                  {ad.angle_used && <Badge variant="secondary" className="text-[10px]">{ad.angle_used}</Badge>}
                </div>
                <div className="font-mono text-xs mb-2">{ad.name}</div>
                {ad.primary_texts?.[0] && <p className="text-sm leading-snug mb-2">{ad.primary_texts[0]}</p>}
                {ad.headlines?.[0] && <p className="text-sm font-semibold">{ad.headlines[0]}</p>}
                {(ad.headlines?.length > 1 || ad.primary_texts?.length > 1) && (
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">+ more variants</summary>
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
  );
}

function TikTokTree({ tree }: { tree: any }) {
  return (
    <div className="space-y-3">
      {tree.ad_groups?.map((g: any, i: number) => (
        <div key={i} className="ml-4 pl-4 border-l-2 border-border/50 space-y-3">
          <div className="p-3 rounded-lg border border-border/50 bg-card/20">
            <div className="flex items-center gap-2 mb-1"><Users className="h-3 w-3 text-primary" /><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ad Group</span></div>
            <div className="font-mono text-sm">{g.name}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {g.audience?.countries?.join(", ")} · {g.audience?.age_min}-{g.audience?.age_max} · {g.audience?.gender} · {g.placements}
            </div>
            {g.audience?.interest_categories?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">{g.audience.interest_categories.slice(0, 8).map((it: string) => <Badge key={it} variant="secondary" className="text-[10px]">{it}</Badge>)}</div>
            )}
          </div>
          <div className="ml-4 pl-4 border-l-2 border-border/30 space-y-2">
            {g.ads?.map((ad: any, j: number) => (
              <div key={j} className="p-3 rounded-lg border border-border/50 bg-card/10">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <MessageSquare className="h-3 w-3 text-primary" />
                  <Badge variant="outline" className="text-[10px]">{ad.format}</Badge>
                  <Badge variant="outline" className="text-[10px]">{ad.cta}</Badge>
                  {ad.angle_used && <Badge variant="secondary" className="text-[10px]">{ad.angle_used}</Badge>}
                </div>
                <div className="font-mono text-xs mb-2">{ad.name}</div>
                {ad.hook && (
                  <div className="mb-2 p-2 rounded bg-primary/5 border border-primary/15">
                    <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-0.5">3-sec hook</div>
                    <p className="text-sm font-semibold">{ad.hook}</p>
                  </div>
                )}
                {ad.script && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Creator script</summary>
                    <p className="mt-1 whitespace-pre-wrap">{ad.script}</p>
                  </details>
                )}
                {ad.caption && <p className="text-xs text-muted-foreground mt-2">{ad.caption}</p>}
                {ad.creator_persona && <div className="text-[10px] text-muted-foreground mt-1">Creator: {ad.creator_persona}</div>}
                <div className="text-[10px] text-muted-foreground mt-2 truncate">→ {ad.destination_url}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GoogleTree({ tree }: { tree: any }) {
  const isPmax = tree.campaign?.type === "PERFORMANCE_MAX";
  return (
    <div className="space-y-3">
      {!isPmax && tree.ad_groups?.map((g: any, i: number) => (
        <div key={i} className="ml-4 pl-4 border-l-2 border-border/50 space-y-3">
          <div className="p-3 rounded-lg border border-border/50 bg-card/20">
            <div className="flex items-center gap-2 mb-1"><Target className="h-3 w-3 text-primary" /><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ad Group · {g.theme}</span></div>
            <div className="font-mono text-sm">{g.name}</div>
            {g.keywords?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {g.keywords.slice(0, 12).map((k: any, ki: number) => (
                  <Badge key={ki} variant="secondary" className="text-[10px]">{k.text} <span className="opacity-60 ml-1">[{k.match_type?.[0]}]</span></Badge>
                ))}
              </div>
            )}
            {g.negative_keywords?.length > 0 && (
              <div className="text-[10px] text-muted-foreground mt-1">Negatives: {g.negative_keywords.join(", ")}</div>
            )}
          </div>
          <div className="ml-4 pl-4 border-l-2 border-border/30 space-y-2">
            {g.ads?.map((ad: any, j: number) => (
              <div key={j} className="p-3 rounded-lg border border-border/50 bg-card/10">
                <div className="font-mono text-xs mb-2">{ad.name}</div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Headlines ({ad.headlines?.length})</div>
                  <ul className="text-xs space-y-0.5">{ad.headlines?.slice(0, 6).map((h: string, k: number) => <li key={k}>· {h}</li>)}</ul>
                </div>
                <div className="mt-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Descriptions</div>
                  <ul className="text-xs space-y-0.5 text-muted-foreground">{ad.descriptions?.map((d: string, k: number) => <li key={k}>· {d}</li>)}</ul>
                </div>
                {ad.sitelinks?.length > 0 && <div className="text-[10px] text-muted-foreground mt-1">Sitelinks: {ad.sitelinks.join(" · ")}</div>}
                <div className="text-[10px] text-muted-foreground mt-2 truncate">→ {ad.final_url}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {isPmax && tree.asset_groups?.map((ag: any, i: number) => (
        <div key={i} className="ml-4 pl-4 border-l-2 border-border/50">
          <div className="p-3 rounded-lg border border-border/50 bg-card/20 space-y-2">
            <div className="flex items-center gap-2"><TrendingUp className="h-3 w-3 text-primary" /><span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Asset Group</span></div>
            <div className="font-mono text-sm">{ag.name}</div>
            <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Headlines ({ag.headlines?.length})</summary>
              <ul className="mt-1 space-y-0.5">{ag.headlines?.map((h: string, k: number) => <li key={k}>· {h}</li>)}</ul>
            </details>
            <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Long headlines</summary>
              <ul className="mt-1 space-y-0.5">{ag.long_headlines?.map((h: string, k: number) => <li key={k}>· {h}</li>)}</ul>
            </details>
            <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Descriptions</summary>
              <ul className="mt-1 space-y-0.5">{ag.descriptions?.map((h: string, k: number) => <li key={k}>· {h}</li>)}</ul>
            </details>
            {ag.image_briefs?.length > 0 && (
              <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Image briefs</summary>
                <ul className="mt-1 space-y-0.5">{ag.image_briefs.map((h: string, k: number) => <li key={k}>· {h}</li>)}</ul>
              </details>
            )}
            {ag.audience_signal && <div className="text-[10px] text-muted-foreground">Audience signal: {ag.audience_signal}</div>}
            <div className="text-[10px] text-muted-foreground truncate">→ {ag.final_url}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// keep BookOpen import quiet
void BookOpen;
