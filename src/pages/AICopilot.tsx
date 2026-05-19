import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Send, Loader2, Plus, Trash2, Brain, TrendingUp, PenTool, MessageSquareText, Sparkles, MenuIcon,
  Wrench, CheckCircle2, AlertCircle, ChevronRight, ChevronDown, Zap, Target, Flame, Wallet,
  AlertTriangle, Users, Calendar, ArrowUpRight, Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NovaPendingActions } from "@/components/ai/NovaPendingActions";
import ReactMarkdown from "react-markdown";

type Mode = "coach" | "analyst" | "copy" | "comms";
type Provider = "openai" | "anthropic" | "gemini" | "lovable";

type Part =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; args: any }
  | { type: "tool_result"; id: string; name: string; status: string; latency_ms: number; result: any };

interface Thread { id: string; title: string; mode: Mode; updated_at: string; }
interface Message { id: string; role: "user" | "assistant"; parts: Part[]; }

const MODES: { id: Mode; label: string; icon: any; tagline: string }[] = [
  { id: "analyst", label: "Analyst", icon: Brain, tagline: "Diagnose performance. Find winners, losers, money leaks, creative fatigue, funnel bottlenecks." },
  { id: "coach", label: "Strategist", icon: TrendingUp, tagline: "Scale the agency. P&L, pricing, retention, cash-flow, hiring — grounded in real numbers." },
  { id: "copy", label: "Creative", icon: PenTool, tagline: "Bangla + English ad copy, hooks, headlines, CTAs — grounded in the client's actual niche." },
  { id: "comms", label: "Client Comms", icon: MessageSquareText, tagline: "Draft factual WhatsApp/email/recaps. Real numbers, bilingual, ready to send." },
];

// One-click agentic workflows
const QUICK_ACTIONS: { id: string; mode: Mode; icon: any; title: string; sub: string; prompt: string; accent: string }[] = [
  { id: "audit", mode: "analyst", icon: Target, accent: "text-blue-500", title: "Weekly audit", sub: "Scan every client, surface 3 leaks + 3 winners with action items.", prompt: "Run a full weekly audit of my agency. For each of my top 10 clients by spend this last 7 days: compute ROAS, list any loss-making campaigns, flag creative fatigue on top spenders, then give me the top 3 money leaks and top 3 winners across the whole agency with concrete next actions." },
  { id: "leaks", mode: "analyst", icon: AlertTriangle, accent: "text-red-500", title: "Find money leaks now", sub: "Loss-making active campaigns this week + pause recommendations.", prompt: "List the loss-making campaigns this last 7 days across all clients (min spend $20). For the top 5 by money wasted, run an optimization brief and tell me which to pause, refresh, or reallocate." },
  { id: "runway", mode: "coach", icon: Wallet, accent: "text-amber-500", title: "Runway risk sweep", sub: "Clients close to zero balance + bilingual top-up reminders.", prompt: "Find clients with low wallet balance. For each one with ≤7 days runway at current spend pace, draft a bilingual (Bangla + English) WhatsApp top-up reminder with the exact recommended top-up amount." },
  { id: "fatigue", mode: "analyst", icon: Flame, accent: "text-orange-500", title: "Creative refresh radar", sub: "Top spending campaigns with fatigue signals + new copy ideas.", prompt: "For my top 5 spending campaigns this last 14 days, run creative fatigue diagnosis. For any tagged 'fatigued' or 'dead', draft 3 new ad copy hooks in Banglish to replace them." },
  { id: "checkin", mode: "comms", icon: MessageSquareText, accent: "text-emerald-500", title: "Client check-in batch", sub: "Status updates for every active client this week.", prompt: "For my top 5 clients by spend this last 7 days, pull a client summary and draft a short Banglish WhatsApp recap (spend, results, ROAS, what we changed, what's next). One block per client." },
  { id: "pnl", mode: "coach", icon: TrendingUp, accent: "text-violet-500", title: "Agency P&L pulse", sub: "Where are you leaking profit this month?", prompt: "Compute my agency-wide P&L for this month. Compare to last month. Rank my top 10 clients by profit contribution. Identify the 3 highest-leverage moves I can make THIS WEEK to improve profit." },
];

const SLASH_COMMANDS: { cmd: string; desc: string; prompt: string; mode?: Mode }[] = [
  { cmd: "/audit", desc: "Run weekly agency audit", prompt: QUICK_ACTIONS[0].prompt, mode: "analyst" },
  { cmd: "/leaks", desc: "Find money leaks", prompt: QUICK_ACTIONS[1].prompt, mode: "analyst" },
  { cmd: "/runway", desc: "Runway risk sweep", prompt: QUICK_ACTIONS[2].prompt, mode: "coach" },
  { cmd: "/fatigue", desc: "Creative fatigue radar", prompt: QUICK_ACTIONS[3].prompt, mode: "analyst" },
  { cmd: "/checkin", desc: "Draft client check-ins", prompt: QUICK_ACTIONS[4].prompt, mode: "comms" },
  { cmd: "/pnl", desc: "Agency P&L pulse", prompt: QUICK_ACTIONS[5].prompt, mode: "coach" },
  { cmd: "/winners", desc: "Top campaigns to scale", prompt: "Find my winning campaigns this last 14 days (min ROAS 2.5, min spend $20). For the top 5, tell me how aggressively to scale each one and what the next bottleneck will be.", mode: "analyst" },
  { cmd: "/copy", desc: "Draft ad copy variants", prompt: "I need 5 ad copy variants in Banglish. Ask me which client and product first if not provided.", mode: "copy" },
];

const PROVIDER_OPTIONS: { id: Provider; label: string }[] = [
  { id: "lovable", label: "Nova default (Lovable AI)" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Claude" },
  { id: "gemini", label: "Gemini" },
];

const TOOL_LABELS: Record<string, string> = {
  search_clients: "Searching clients",
  get_client_summary: "Pulling client summary",
  get_campaign_breakdown: "Breaking down campaigns",
  list_loss_making_campaigns: "Hunting money leaks",
  list_winning_campaigns: "Finding winners",
  get_agency_pnl: "Computing agency P&L",
  get_low_balance_clients: "Checking low balances",
  compare_periods: "Comparing time periods",
  list_top_clients_by_spend: "Ranking clients by spend",
  get_creative_fatigue: "Diagnosing creative fatigue",
  get_funnel_health: "Analyzing funnel health",
  get_runway_forecast: "Forecasting wallet runway",
  draft_optimization_brief: "Writing optimization brief",
  remember_fact: "Saving to long-term memory",
  recall_facts: "Recalling memory",
  propose_action: "Proposing action for approval",
  list_pending_actions: "Listing pending actions",
};

export default function AICopilot() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("analyst");
  const [provider, setProvider] = useState<Provider>("lovable");
  const [model, setModel] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showSidebar, setShowSidebar] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeMode = useMemo(() => MODES.find((m) => m.id === mode)!, [mode]);

  const loadThreads = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ai_threads").select("id, title, mode, updated_at")
      .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(50);
    setThreads((data || []) as Thread[]);
  };

  const loadMessages = async (threadId: string) => {
    const { data } = await supabase
      .from("ai_messages").select("id, role, parts")
      .eq("thread_id", threadId).order("created_at", { ascending: true });
    setMessages((data || []).map((m: any) => ({
      id: m.id, role: m.role, parts: Array.isArray(m.parts) ? m.parts : [{ type: "text", text: "" }],
    })));
  };

  useEffect(() => { loadThreads(); /* eslint-disable-next-line */ }, [user]);
  useEffect(() => {
    if (activeId) {
      loadMessages(activeId);
      const t = threads.find((x) => x.id === activeId);
      if (t) setMode(t.mode);
    } else { setMessages([]); }
  }, [activeId]); // eslint-disable-line
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, currentStep]);

  const newThread = async (forMode: Mode = mode) => {
    if (!user) return null;
    const { data: profile } = await supabase.from("profiles").select("org_id").eq("user_id", user.id).single();
    const { data, error } = await supabase
      .from("ai_threads")
      .insert({ user_id: user.id, mode: forMode, title: "New chat", org_id: profile?.org_id })
      .select("id, title, mode, updated_at").single();
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return null; }
    setThreads([data as Thread, ...threads]);
    setActiveId(data!.id); setMode(forMode); setMessages([]);
    return data!.id;
  };

  const deleteThread = async (id: string) => {
    if (!confirm("Delete this conversation?")) return;
    await supabase.from("ai_threads").delete().eq("id", id);
    setThreads(threads.filter((t) => t.id !== id));
    if (activeId === id) { setActiveId(null); setMessages([]); }
  };

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;
    let tid = activeId;
    if (!tid) { tid = await newThread(mode); if (!tid) return; }

    setSending(true); setInput(""); setCurrentStep(0);
    const userMsg: Message = { id: `temp-u-${Date.now()}`, role: "user", parts: [{ type: "text", text }] };
    const assistantMsg: Message = { id: `temp-a-${Date.now()}`, role: "assistant", parts: [] };
    setMessages((m) => [...m, userMsg, assistantMsg]);

    try {
      const url = `https://hhpiimnvkgmpfnldgdhc.supabase.co/functions/v1/ai-copilot-chat`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ thread_id: tid, text, mode, provider, model: model || undefined }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text();
        let errMsg = errText; try { errMsg = JSON.parse(errText).error || errText; } catch { /* */ }
        setMessages((m) => m.map((x) => x.id === assistantMsg.id ? { ...x, parts: [{ type: "text", text: `❌ ${errMsg}` }] } : x));
        toast({ title: "Request failed", description: errMsg, variant: "destructive" });
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const parts: Part[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim(); if (!t) continue;
          let evt: any; try { evt = JSON.parse(t); } catch { continue; }
          if (evt.type === "step") {
            setCurrentStep(evt.step);
          } else if (evt.type === "text") {
            // Append/merge into a trailing text part
            const last = parts[parts.length - 1];
            if (last && last.type === "text") last.text += evt.text;
            else parts.push({ type: "text", text: evt.text });
          } else if (evt.type === "tool_call") {
            parts.push({ type: "tool_call", id: evt.id, name: evt.name, args: evt.args });
          } else if (evt.type === "tool_result") {
            parts.push({ type: "tool_result", id: evt.id, name: evt.name, status: evt.status, latency_ms: evt.latency_ms, result: evt.result });
          } else if (evt.type === "error") {
            parts.push({ type: "text", text: `\n\n❌ ${evt.error}` });
          }
          setMessages((m) => m.map((x) => x.id === assistantMsg.id ? { ...x, parts: [...parts] } : x));
        }
      }
      loadThreads();
    } catch (e: any) {
      toast({ title: "Network error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false); setCurrentStep(0);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleComposerSubmit(); }
  };

  // Handle slash-command expansion before sending
  const handleComposerSubmit = () => {
    const raw = input.trim();
    if (!raw) return;
    if (raw.startsWith("/")) {
      const [cmd] = raw.split(/\s+/);
      const match = SLASH_COMMANDS.find((s) => s.cmd === cmd.toLowerCase());
      if (match) {
        if (match.mode) setMode(match.mode);
        send(match.prompt);
        return;
      }
    }
    send();
  };

  const slashHints = input.startsWith("/")
    ? SLASH_COMMANDS.filter((s) => s.cmd.startsWith(input.split(/\s+/)[0].toLowerCase())).slice(0, 6)
    : [];

  const runQuickAction = (qa: typeof QUICK_ACTIONS[number]) => {
    setMode(qa.mode);
    setActiveId(null);
    setMessages([]);
    // brief async to let mode state apply before send creates the thread
    setTimeout(() => send(qa.prompt), 50);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      <aside className={cn("transition-all overflow-hidden flex-shrink-0", showSidebar ? "w-72" : "w-0")}>
        <Card className="h-full flex flex-col">
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center gap-2 px-1">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold leading-tight">Nova</div>
                <div className="text-[10px] text-muted-foreground leading-tight">Growth Operator</div>
              </div>
              <Badge variant="outline" className="gap-1 text-[9px] h-5 px-1.5"><Zap className="h-2.5 w-2.5" /> Agentic</Badge>
            </div>
            <Button onClick={() => { setActiveId(null); setMessages([]); }} className="w-full gap-2" size="sm" variant="default">
              <Plus className="h-4 w-4" /> New mission
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-2 pb-1">Recent</div>
              {threads.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No missions yet.</p>}
              {threads.map((t) => {
                const M = MODES.find((m) => m.id === t.mode) || MODES[0];
                const Icon = M.icon;
                return (
                  <div key={t.id} onClick={() => setActiveId(t.id)}
                    className={cn("group cursor-pointer rounded-lg px-2.5 py-2 text-sm flex items-start gap-2 transition-colors",
                      activeId === t.id ? "bg-accent" : "hover:bg-accent/50")}>
                    <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{t.title}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{M.label}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deleteThread(t.id); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </Card>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Button variant="ghost" size="icon" onClick={() => setShowSidebar(!showSidebar)}><MenuIcon className="h-4 w-4" /></Button>
          <div className="flex flex-wrap gap-1 mr-auto">
            {MODES.map((m) => {
              const Icon = m.icon;
              return (
                <Button key={m.id} size="sm" variant={mode === m.id ? "default" : "outline"}
                  onClick={() => { setMode(m.id); setActiveId(null); setMessages([]); }} className="gap-1.5">
                  <Icon className="h-3.5 w-3.5" />{m.label}
                </Button>
              );
            })}
          </div>
          <Select value={provider} onValueChange={(v) => { setProvider(v as Provider); setModel(""); }}>
            <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card className="flex-1 flex flex-col min-h-0">
          <ScrollArea className="flex-1" ref={scrollRef as any}>
            <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
              {messages.length === 0 ? (
                <div className="py-4 space-y-6">
                  {/* Hero */}
                  <div className="text-center space-y-3 pt-2">
                    <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/50 text-primary-foreground shadow-lg shadow-primary/20">
                      <Bot className="h-8 w-8" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight">Hi, I'm Nova.</h2>
                      <p className="text-sm text-muted-foreground mt-1.5 max-w-lg mx-auto">
                        Your senior media buyer + growth strategist. Give me a goal — I'll pull live data,
                        diagnose, and hand you a numbered action list. <span className="text-foreground/80 font-medium">No fluff.</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                      <span className="px-2 py-0.5 rounded-full bg-muted/60">Mode: <span className="text-foreground font-medium">{activeMode.label}</span></span>
                      <span className="px-2 py-0.5 rounded-full bg-muted/60">13 live tools</span>
                      <span className="px-2 py-0.5 rounded-full bg-muted/60">Up to 16 reasoning steps</span>
                      <span className="px-2 py-0.5 rounded-full bg-muted/60">Diagnose → Insight → Action</span>
                    </div>
                  </div>

                  {/* Quick-action workflows */}
                  <div>
                    <div className="flex items-center justify-between mb-2 px-1">
                      <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">⚡ One-click missions</h3>
                      <span className="text-[10px] text-muted-foreground">Tap to run end-to-end</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {QUICK_ACTIONS.map((qa) => {
                        const Icon = qa.icon;
                        return (
                          <button key={qa.id} onClick={() => runQuickAction(qa)}
                            className="group text-left p-3 rounded-xl border border-border/60 bg-card hover:border-primary/50 hover:shadow-md hover:shadow-primary/5 transition-all">
                            <div className="flex items-start gap-2.5">
                              <div className={cn("h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0", qa.accent)}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
                                  {qa.title}
                                  <ArrowUpRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{qa.sub}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Slash commands hint */}
                  <div className="border border-dashed border-border/60 rounded-xl p-3 bg-muted/20">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">⌨️ Slash commands</div>
                    <div className="flex flex-wrap gap-1.5">
                      {SLASH_COMMANDS.map((s) => (
                        <button key={s.cmd} onClick={() => { if (s.mode) setMode(s.mode); send(s.prompt); }}
                          className="px-2 py-1 rounded-md bg-background border border-border/60 text-[11px] hover:border-primary/50 hover:bg-accent/40 transition">
                          <code className="font-mono text-primary">{s.cmd}</code>
                          <span className="text-muted-foreground ml-1.5">{s.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isLast = idx === messages.length - 1;
                  const isLiveAssistant = isLast && sending && m.role === "assistant";
                  return (
                    <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "rounded-2xl px-4 py-2.5 max-w-[92%] text-sm",
                        m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/30 border border-border/50 w-full",
                      )}>
                        {m.role === "user" ? (
                          <div className="whitespace-pre-wrap">{(m.parts[0] as any)?.text || ""}</div>
                        ) : (
                          <AssistantBody parts={m.parts} live={isLiveAssistant} currentStep={currentStep} />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <div className="border-t p-3 relative">
            {slashHints.length > 0 && (
              <div className="absolute bottom-full left-3 right-3 mb-2 max-w-3xl mx-auto bg-popover border border-border rounded-lg shadow-lg p-1 z-10">
                {slashHints.map((s) => (
                  <button key={s.cmd} onClick={() => { setInput(""); if (s.mode) setMode(s.mode); send(s.prompt); }}
                    className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-accent flex items-center gap-2">
                    <code className="font-mono text-primary font-semibold">{s.cmd}</code>
                    <span className="text-muted-foreground">{s.desc}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-end max-w-4xl mx-auto">
              <Textarea
                placeholder={`Give Nova a goal…  Try /audit, /leaks, /runway  (Enter to send, Shift+Enter for newline)`}
                value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
                rows={1} className="resize-none min-h-[44px] max-h-40" disabled={sending}
              />
              <Button onClick={handleComposerSubmit} disabled={sending || !input.trim()} size="icon" className="h-11 w-11">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              Nova chains live data tools (up to 16 steps). {provider === "lovable" ? "Running on Lovable AI." : `Using your ${provider} key.`} Verify critical decisions before acting.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}


function AssistantBody({ parts, live, currentStep }: { parts: Part[]; live: boolean; currentStep: number }) {
  if (!parts.length && live) {
    return (
      <span className="inline-flex gap-1.5 items-center text-muted-foreground text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        {currentStep > 0 ? `Thinking (step ${currentStep})…` : "Thinking…"}
      </span>
    );
  }
  return (
    <div className="space-y-2">
      {parts.map((p, i) => {
        if (p.type === "text") {
          if (!p.text.trim()) return null;
          return (
            <div key={i} className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-headings:mt-3 prose-headings:mb-1 prose-table:text-xs">
              <ReactMarkdown>{p.text}</ReactMarkdown>
            </div>
          );
        }
        if (p.type === "tool_call") {
          // pair with following tool_result if any
          const next = parts[i + 1];
          const paired = next && next.type === "tool_result" && (next as any).id === p.id ? (next as any) : null;
          if (paired) return null; // render via the result block below
          return <ToolCard key={i} name={p.name} args={p.args} pending />;
        }
        if (p.type === "tool_result") {
          // find the preceding call
          const prev = parts[i - 1];
          const call = prev && prev.type === "tool_call" && (prev as any).id === p.id ? prev : null;
          return <ToolCard key={i} name={p.name} args={(call as any)?.args || {}} result={p.result} status={p.status} latencyMs={p.latency_ms} />;
        }
        return null;
      })}
      {live && (
        <span className="inline-flex gap-1.5 items-center text-muted-foreground text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          {currentStep > 0 ? `Step ${currentStep}…` : "Thinking…"}
        </span>
      )}
    </div>
  );
}

function ToolCard({ name, args, result, status, latencyMs, pending }: { name: string; args: any; result?: any; status?: string; latencyMs?: number; pending?: boolean }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[name] || name;
  const ok = !pending && status === "ok";
  const err = status === "error";
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 hover:bg-accent/40 px-3 py-2 text-xs transition text-left">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            : err ? <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
          <Wrench className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium">{label}</span>
          <code className="text-[10px] text-muted-foreground">{name}</code>
          {latencyMs != null && <span className="ml-auto text-[10px] text-muted-foreground">{latencyMs}ms</span>}
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 ml-5 space-y-1">
        {args && Object.keys(args).length > 0 && (
          <div className="text-[11px]">
            <div className="text-muted-foreground mb-0.5">Input</div>
            <pre className="bg-muted/40 rounded p-2 overflow-x-auto text-[10px] leading-tight">{JSON.stringify(args, null, 2)}</pre>
          </div>
        )}
        {result !== undefined && (
          <div className="text-[11px]">
            <div className="text-muted-foreground mb-0.5">Result</div>
            <pre className="bg-muted/40 rounded p-2 overflow-x-auto text-[10px] leading-tight max-h-64">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
