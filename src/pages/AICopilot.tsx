import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Send, Loader2, Plus, Trash2, Brain, TrendingUp, PenTool, MessageSquareText, MenuIcon,
  Wrench, CheckCircle2, AlertCircle, ChevronRight, ChevronDown, Zap, Target, Flame, Wallet,
  AlertTriangle, ArrowUpRight, Bot, Copy, Check, RefreshCw, ThumbsUp, ThumbsDown, Square, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NovaPendingActions } from "@/components/ai/NovaPendingActions";
import { ChatMarkdown } from "@/components/ai/ChatMarkdown";

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
  { id: "lovable", label: "Nova default" },
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

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

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
  const [currentToolLabel, setCurrentToolLabel] = useState<string>("");
  const [showSidebar, setShowSidebar] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

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

  // Smart auto-scroll: only stick to bottom when user is near bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const viewport = el.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    const target = viewport || el;
    const onScroll = () => {
      const dist = target.scrollHeight - target.scrollTop - target.clientHeight;
      stickToBottomRef.current = dist < 120;
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    const viewport = el?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    const target = viewport || el;
    target?.scrollTo({ top: target.scrollHeight, behavior: "smooth" });
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

    setSending(true); setInput(""); setCurrentStep(0); setCurrentToolLabel("");
    stickToBottomRef.current = true;
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
            const last = parts[parts.length - 1];
            if (last && last.type === "text") last.text += evt.text;
            else parts.push({ type: "text", text: evt.text });
          } else if (evt.type === "tool_call") {
            setCurrentToolLabel(TOOL_LABELS[evt.name] || evt.name);
            parts.push({ type: "tool_call", id: evt.id, name: evt.name, args: evt.args });
          } else if (evt.type === "tool_result") {
            setCurrentToolLabel("");
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
      setSending(false); setCurrentStep(0); setCurrentToolLabel("");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleComposerSubmit(); }
  };

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
    setTimeout(() => send(qa.prompt), 50);
  };

  const regenerateLast = () => {
    // Find last user message and re-send it
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        const text = (messages[i].parts[0] as any)?.text;
        if (text) {
          // Trim trailing assistant placeholder if any
          setMessages((m) => {
            const idx = m.findIndex((x) => x.id === messages[i].id);
            return m.slice(0, idx);
          });
          setTimeout(() => send(text), 30);
        }
        return;
      }
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      {/* Sidebar */}
      <aside className={cn("transition-all overflow-hidden flex-shrink-0", showSidebar ? "w-72" : "w-0")}>
        <div className="h-full flex flex-col rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm">
          <div className="p-3 border-b border-border/60 space-y-2">
            <div className="flex items-center gap-2 px-1">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary via-primary to-primary/60 flex items-center justify-center shadow-md shadow-primary/30">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold leading-tight tracking-tight">Nova</div>
                <div className="text-[10px] text-muted-foreground leading-tight">Growth Operator</div>
              </div>
              <Badge variant="outline" className="gap-1 text-[9px] h-5 px-1.5 border-primary/30 text-primary"><Zap className="h-2.5 w-2.5" /> Agentic</Badge>
            </div>
            <Button onClick={() => { setActiveId(null); setMessages([]); }} className="w-full gap-2" size="sm">
              <Plus className="h-4 w-4" /> New chat
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80 px-2 pt-2 pb-1.5 font-semibold">Recent</div>
              {threads.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No conversations yet.</p>}
              {threads.map((t) => {
                const M = MODES.find((m) => m.id === t.mode) || MODES[0];
                const Icon = M.icon;
                const isActive = activeId === t.id;
                return (
                  <div key={t.id} onClick={() => setActiveId(t.id)}
                    className={cn(
                      "group relative cursor-pointer rounded-lg pl-3 pr-2 py-2 text-sm flex items-start gap-2 transition-colors",
                      isActive ? "bg-accent" : "hover:bg-accent/50"
                    )}>
                    {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-primary" />}
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
        </div>
      </aside>

      {/* Main pane */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Button variant="ghost" size="icon" onClick={() => setShowSidebar(!showSidebar)}><MenuIcon className="h-4 w-4" /></Button>
          <div className="flex flex-wrap gap-1 mr-auto">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button key={m.id}
                  onClick={() => { setMode(m.id); setActiveId(null); setMessages([]); }}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-medium px-3 h-8 rounded-full border transition-all",
                    active
                      ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30"
                      : "bg-card/40 border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40"
                  )}>
                  <Icon className="h-3.5 w-3.5" />{m.label}
                </button>
              );
            })}
          </div>
          <Select value={provider} onValueChange={(v) => { setProvider(v as Provider); setModel(""); }}>
            <SelectTrigger className="w-[170px] h-8 text-xs rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Chat surface */}
        <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-border/60 bg-gradient-to-b from-card/50 to-card/20 backdrop-blur-sm overflow-hidden">
          <ScrollArea className="flex-1" ref={scrollRef as any}>
            <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto w-full">
              <NovaPendingActions />
              {messages.length === 0 ? (
                <EmptyState
                  activeMode={activeMode}
                  onQuickAction={runQuickAction}
                  onSlash={(s) => { if (s.mode) setMode(s.mode); send(s.prompt); }}
                />
              ) : (
                <div className="space-y-6">
                  {messages.map((m, idx) => {
                    const isLast = idx === messages.length - 1;
                    const isLiveAssistant = isLast && sending && m.role === "assistant";
                    return (
                      <MessageRow
                        key={m.id}
                        message={m}
                        live={isLiveAssistant}
                        currentStep={currentStep}
                        currentToolLabel={currentToolLabel}
                        onRegenerate={regenerateLast}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Composer */}
          <div className="border-t border-border/60 bg-background/40 backdrop-blur-sm px-3 md:px-6 py-3 relative">
            {slashHints.length > 0 && (
              <div className="absolute bottom-full left-3 right-3 mb-2 max-w-3xl mx-auto bg-popover border border-border rounded-xl shadow-xl p-1.5 z-10">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 font-semibold">Commands</div>
                {slashHints.map((s) => (
                  <button key={s.cmd} onClick={() => { setInput(""); if (s.mode) setMode(s.mode); send(s.prompt); }}
                    className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-accent flex items-center gap-2">
                    <code className="font-mono text-primary font-semibold">{s.cmd}</code>
                    <span className="text-muted-foreground">{s.desc}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="max-w-3xl mx-auto">
              <div className={cn(
                "group relative flex items-end gap-2 rounded-2xl border bg-background shadow-sm transition-all",
                "border-border/60 focus-within:border-primary/50 focus-within:shadow-md focus-within:shadow-primary/10"
              )}>
                <Textarea
                  placeholder={`Message Nova…  try /audit, /leaks, /runway`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  className="resize-none min-h-[52px] max-h-64 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-4 py-3.5 text-[14.5px]"
                  disabled={sending}
                />
                <div className="flex items-center gap-1 pr-2 pb-2">
                  <Button
                    onClick={handleComposerSubmit}
                    disabled={sending ? false : !input.trim()}
                    size="icon"
                    className={cn(
                      "h-9 w-9 rounded-xl transition-all",
                      sending && "bg-muted text-muted-foreground hover:bg-muted"
                    )}
                    title={sending ? "Generating…" : "Send"}
                  >
                    {sending ? <Square className="h-3.5 w-3.5 fill-current" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-[10.5px] text-muted-foreground/80 text-center mt-2 px-2">
                Nova chains live tools (up to 32 steps), remembers facts, and proposes actions for your approval. {provider === "lovable" ? "Running on Lovable AI." : `Using your ${provider} key.`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ MESSAGE ROW ============================ */

function MessageRow({
  message, live, currentStep, currentToolLabel, onRegenerate,
}: {
  message: Message; live: boolean; currentStep: number; currentToolLabel: string; onRegenerate: () => void;
}) {
  const isUser = message.role === "user";
  if (isUser) {
    return (
      <div className="flex justify-end group">
        <div className="flex items-start gap-2.5 max-w-[85%]">
          <div className="rounded-2xl rounded-tr-md bg-muted/60 border border-border/40 px-4 py-2.5 text-[14.5px] whitespace-pre-wrap leading-relaxed">
            {(message.parts[0] as any)?.text || ""}
          </div>
          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="group flex items-start gap-3">
      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary via-primary to-primary/60 flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-primary/20">
        <Bot className="h-4 w-4 text-primary-foreground" />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <AssistantBody
          parts={message.parts}
          live={live}
          currentStep={currentStep}
          currentToolLabel={currentToolLabel}
        />
        {!live && message.parts.length > 0 && (
          <MessageActions
            text={extractText(message.parts)}
            onRegenerate={onRegenerate}
          />
        )}
      </div>
    </div>
  );
}

function extractText(parts: Part[]) {
  return parts.filter((p) => p.type === "text").map((p: any) => p.text).join("\n");
}

function MessageActions({ text, onRegenerate }: { text: string; onRegenerate: () => void }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  return (
    <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5 mt-2 -ml-1">
      <button
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition"
        title="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={onRegenerate}
        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition"
        title="Regenerate"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setFeedback(feedback === "up" ? null : "up")}
        className={cn("h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent transition",
          feedback === "up" ? "text-emerald-500" : "text-muted-foreground hover:text-foreground")}
        title="Good response"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setFeedback(feedback === "down" ? null : "down")}
        className={cn("h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent transition",
          feedback === "down" ? "text-destructive" : "text-muted-foreground hover:text-foreground")}
        title="Bad response"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AssistantBody({
  parts, live, currentStep, currentToolLabel,
}: {
  parts: Part[]; live: boolean; currentStep: number; currentToolLabel: string;
}) {
  if (!parts.length && live) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-1">
        <span className="inline-flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "120ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "240ms" }} />
        </span>
        <span className="text-xs">{currentToolLabel || (currentStep > 0 ? `Thinking · step ${currentStep}` : "Thinking…")}</span>
      </div>
    );
  }
  // Find last text part to know where to put the caret
  let lastTextIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === "text") { lastTextIdx = i; break; }
  }
  return (
    <div className="space-y-2.5">
      {live && (currentToolLabel || currentStep > 0) && (
        <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/50 border border-border/50 rounded-full px-2.5 py-0.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          {currentToolLabel || `Step ${currentStep}`}
        </div>
      )}
      {parts.map((p, i) => {
        if (p.type === "text") {
          if (!p.text.trim() && !(live && i === lastTextIdx)) return null;
          const isLastText = i === lastTextIdx;
          return (
            <div key={i}>
              <ChatMarkdown>{p.text}</ChatMarkdown>
              {live && isLastText && (
                <span className="inline-block w-[3px] h-[1.1em] -mb-[3px] ml-0.5 bg-primary animate-pulse rounded-sm align-middle" />
              )}
            </div>
          );
        }
        if (p.type === "tool_call") {
          const next = parts[i + 1];
          const paired = next && next.type === "tool_result" && (next as any).id === p.id ? (next as any) : null;
          if (paired) return null;
          return <ToolCard key={i} name={p.name} args={p.args} pending />;
        }
        if (p.type === "tool_result") {
          const prev = parts[i - 1];
          const call = prev && prev.type === "tool_call" && (prev as any).id === p.id ? prev : null;
          return <ToolCard key={i} name={p.name} args={(call as any)?.args || {}} result={p.result} status={p.status} latencyMs={p.latency_ms} />;
        }
        return null;
      })}
      {/* Caret when streaming hasn't produced text yet but tools done */}
      {live && lastTextIdx === -1 && parts.length > 0 && (
        <span className="inline-block w-[3px] h-[1.1em] bg-primary animate-pulse rounded-sm" />
      )}
    </div>
  );
}

/* ============================ EMPTY STATE ============================ */

function EmptyState({
  activeMode, onQuickAction, onSlash,
}: {
  activeMode: typeof MODES[number];
  onQuickAction: (qa: typeof QUICK_ACTIONS[number]) => void;
  onSlash: (s: typeof SLASH_COMMANDS[number]) => void;
}) {
  return (
    <div className="py-6 space-y-8">
      <div className="space-y-3 pt-6">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/50 text-primary-foreground shadow-lg shadow-primary/30">
          <Bot className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            {greeting()} — what should we ship?
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-lg">
            Your senior media buyer + growth strategist. Give me a goal — I'll pull live data, diagnose, and hand you a numbered action list.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
          <span className="px-2.5 py-1 rounded-full bg-muted/60 border border-border/40">Mode · <span className="text-foreground font-medium">{activeMode.label}</span></span>
          <span className="px-2.5 py-1 rounded-full bg-muted/60 border border-border/40">17 live tools</span>
          <span className="px-2.5 py-1 rounded-full bg-muted/60 border border-border/40">Up to 32 reasoning steps</span>
          <span className="px-2.5 py-1 rounded-full bg-muted/60 border border-border/40">Human-approved actions</span>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3 px-0.5">
          <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground font-semibold">One-click missions</h3>
          <span className="text-[10px] text-muted-foreground">Tap to run end-to-end</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {QUICK_ACTIONS.map((qa) => {
            const Icon = qa.icon;
            return (
              <button key={qa.id} onClick={() => onQuickAction(qa)}
                className="group relative text-left p-3.5 rounded-xl border border-border/60 bg-card/40 hover:border-primary/50 hover:bg-card/70 transition-all overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-primary/0 transition-all pointer-events-none" />
                <div className="flex items-start gap-3 relative">
                  <div className={cn("h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 group-hover:scale-110 transition", qa.accent)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
                      {qa.title}
                      <ArrowUpRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                    </div>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">{qa.sub}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border border-dashed border-border/60 rounded-xl p-3.5 bg-muted/10">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-2 px-1">Slash commands</div>
        <div className="flex flex-wrap gap-1.5">
          {SLASH_COMMANDS.map((s) => (
            <button key={s.cmd} onClick={() => onSlash(s)}
              className="px-2.5 py-1 rounded-md bg-background border border-border/60 text-[11px] hover:border-primary/50 hover:bg-accent/40 transition">
              <code className="font-mono text-primary">{s.cmd}</code>
              <span className="text-muted-foreground ml-1.5">{s.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================ TOOL CARD ============================ */

function ToolCard({ name, args, result, status, latencyMs, pending }: { name: string; args: any; result?: any; status?: string; latencyMs?: number; pending?: boolean }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[name] || name;
  const err = status === "error";
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 px-3 py-1.5 text-xs transition text-left">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            : err ? <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
          <Wrench className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium">{label}</span>
          <code className="text-[10px] text-muted-foreground hidden sm:inline">{name}</code>
          {latencyMs != null && <span className="ml-auto text-[10px] text-muted-foreground">{latencyMs}ms</span>}
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1.5 ml-5 space-y-1">
        {args && Object.keys(args).length > 0 && (
          <div className="text-[11px]">
            <div className="text-muted-foreground mb-0.5">Input</div>
            <pre className="bg-muted/40 rounded-lg p-2 overflow-x-auto text-[10px] leading-tight border border-border/40">{JSON.stringify(args, null, 2)}</pre>
          </div>
        )}
        {result !== undefined && (
          <div className="text-[11px]">
            <div className="text-muted-foreground mb-0.5">Result</div>
            <pre className="bg-muted/40 rounded-lg p-2 overflow-x-auto text-[10px] leading-tight max-h-64 border border-border/40">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
