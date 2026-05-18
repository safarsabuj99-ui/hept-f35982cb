import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Send, Loader2, Plus, Trash2, Brain, TrendingUp, PenTool, MessageSquareText, Sparkles, MenuIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

type Mode = "coach" | "analyst" | "copy" | "comms";
type Provider = "openai" | "anthropic" | "gemini" | "lovable";

const MODES: { id: Mode; label: string; icon: any; tagline: string; quickPrompts: string[] }[] = [
  {
    id: "coach", label: "Growth Coach", icon: TrendingUp,
    tagline: "Ask anything about scaling your agency — pricing, clients, retention, hiring.",
    quickPrompts: [
      "How should I price my service for a new e-commerce client doing 5 lakh BDT/month revenue?",
      "Give me a 30-day plan to land 3 new clients in Bangladesh.",
      "What's the right way to fire an unprofitable client without burning bridges?",
      "How do I move from project work to monthly retainers?",
    ],
  },
  {
    id: "analyst", label: "Campaign Analyst", icon: Brain,
    tagline: "Analyze campaign performance, find winners/losers, recommend next moves.",
    quickPrompts: [
      "I have a client spending $1,200/month on Meta with 1.8 ROAS. Worth keeping?",
      "My CPM doubled this week — what should I check first?",
      "How do I tell if a creative is fatigued vs the audience is wrong?",
      "Walk me through a profitability audit for a Bangladesh fashion brand.",
    ],
  },
  {
    id: "copy", label: "Ad Copy", icon: PenTool,
    tagline: "Bangla + English ad copy, hooks, headlines, primary text.",
    quickPrompts: [
      "Write 5 Facebook hooks for a Bangladesh organic skincare brand.",
      "Banglish primary text for a 50% off Eid sale on women's clothing.",
      "3 TikTok hook variants for a restaurant in Dhaka.",
      "Headlines for Google Search ads — IELTS coaching center.",
    ],
  },
  {
    id: "comms", label: "Client Comms", icon: MessageSquareText,
    tagline: "Draft client emails, performance recaps, WhatsApp updates.",
    quickPrompts: [
      "Polite email asking a client to top up their wallet — 3 days overdue.",
      "WhatsApp update: spent $300 this week, got 14 leads, CPL down 22%.",
      "Apology email — Meta ad account got restricted, here's the fix plan.",
      "Monthly performance recap template I can reuse for every client.",
    ],
  },
];

const PROVIDER_OPTIONS: { id: Provider; label: string }[] = [
  { id: "lovable", label: "Lovable AI (built-in)" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Claude" },
  { id: "gemini", label: "Gemini" },
];

interface Thread { id: string; title: string; mode: Mode; updated_at: string; }
interface Message { id: string; role: "user" | "assistant"; text: string; }

function partsToText(parts: any): string {
  if (!Array.isArray(parts)) return "";
  return parts.filter((p: any) => p?.type === "text").map((p: any) => p.text).join("");
}

export default function AICopilot() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("coach");
  const [provider, setProvider] = useState<Provider>("lovable");
  const [model, setModel] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeMode = useMemo(() => MODES.find((m) => m.id === mode)!, [mode]);

  const loadThreads = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ai_threads")
      .select("id, title, mode, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    setThreads((data || []) as Thread[]);
  };

  const loadMessages = async (threadId: string) => {
    const { data } = await supabase
      .from("ai_messages")
      .select("id, role, parts")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setMessages(
      (data || []).map((m: any) => ({ id: m.id, role: m.role, text: partsToText(m.parts) })) as Message[],
    );
  };

  useEffect(() => { loadThreads(); /* eslint-disable-next-line */ }, [user]);

  useEffect(() => {
    if (activeId) {
      loadMessages(activeId);
      const t = threads.find((x) => x.id === activeId);
      if (t) setMode(t.mode);
    } else {
      setMessages([]);
    }
  }, [activeId]); // eslint-disable-line

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const newThread = async (forMode: Mode = mode) => {
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("org_id").eq("user_id", user.id).single();
    const { data, error } = await supabase
      .from("ai_threads")
      .insert({ user_id: user.id, mode: forMode, title: "New chat", org_id: profile?.org_id })
      .select("id, title, mode, updated_at")
      .single();
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return null; }
    setThreads([data as Thread, ...threads]);
    setActiveId(data!.id);
    setMode(forMode);
    setMessages([]);
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
    if (!tid) {
      tid = await newThread(mode);
      if (!tid) return;
    }

    setSending(true);
    setInput("");
    const userMsg: Message = { id: `temp-u-${Date.now()}`, role: "user", text };
    const assistantMsg: Message = { id: `temp-a-${Date.now()}`, role: "assistant", text: "" };
    setMessages((m) => [...m, userMsg, assistantMsg]);

    try {
      const url = `https://hhpiimnvkgmpfnldgdhc.supabase.co/functions/v1/ai-copilot-chat`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ thread_id: tid, text, mode, provider, model: model || undefined }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text();
        let errMsg = errText;
        try { errMsg = JSON.parse(errText).error || errText; } catch { /* */ }
        setMessages((m) => m.map((x) => x.id === assistantMsg.id ? { ...x, text: `❌ ${errMsg}` } : x));
        toast({ title: "Request failed", description: errMsg, variant: "destructive" });
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages((m) => m.map((x) => x.id === assistantMsg.id ? { ...x, text: acc } : x));
      }

      // Refresh thread list for updated title/timestamp
      loadThreads();
    } catch (e: any) {
      toast({ title: "Network error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      {/* Sidebar */}
      <aside className={cn(
        "transition-all overflow-hidden flex-shrink-0",
        showSidebar ? "w-72" : "w-0"
      )}>
        <Card className="h-full flex flex-col">
          <div className="p-3 border-b">
            <Button onClick={() => newThread(mode)} className="w-full gap-2" size="sm">
              <Plus className="h-4 w-4" /> New chat
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {threads.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No conversations yet.</p>
              )}
              {threads.map((t) => {
                const M = MODES.find((m) => m.id === t.mode) || MODES[0];
                const Icon = M.icon;
                return (
                  <div
                    key={t.id}
                    onClick={() => setActiveId(t.id)}
                    className={cn(
                      "group cursor-pointer rounded-lg px-2.5 py-2 text-sm flex items-start gap-2 transition-colors",
                      activeId === t.id ? "bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{t.title}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{M.label}</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteThread(t.id); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </Card>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Button variant="ghost" size="icon" onClick={() => setShowSidebar(!showSidebar)}>
            <MenuIcon className="h-4 w-4" />
          </Button>
          <div className="flex flex-wrap gap-1 mr-auto">
            {MODES.map((m) => {
              const Icon = m.icon;
              return (
                <Button
                  key={m.id}
                  size="sm"
                  variant={mode === m.id ? "default" : "outline"}
                  onClick={() => { setMode(m.id); setActiveId(null); setMessages([]); }}
                  className="gap-1.5"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {m.label}
                </Button>
              );
            })}
          </div>
          <Select value={provider} onValueChange={(v) => { setProvider(v as Provider); setModel(""); }}>
            <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Messages */}
        <Card className="flex-1 flex flex-col min-h-0">
          <ScrollArea className="flex-1" ref={scrollRef as any}>
            <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
              {messages.length === 0 ? (
                <div className="py-8 text-center space-y-4">
                  <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="h-7 w-7" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{activeMode.label}</h2>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{activeMode.tagline}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl mx-auto pt-4">
                    {activeMode.quickPrompts.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => send(p)}
                        className="text-left text-sm p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/40 transition"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "rounded-2xl px-4 py-2.5 max-w-[85%] text-sm",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50",
                    )}>
                      {m.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-headings:mt-3 prose-headings:mb-1">
                          {m.text ? <ReactMarkdown>{m.text}</ReactMarkdown> : <span className="inline-flex gap-1 items-center text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> thinking…</span>}
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{m.text}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Composer */}
          <div className="border-t p-3">
            <div className="flex gap-2 items-end max-w-3xl mx-auto">
              <Textarea
                placeholder={`Message ${activeMode.label}…  (Enter to send, Shift+Enter for newline)`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                className="resize-none min-h-[44px] max-h-40"
                disabled={sending}
              />
              <Button onClick={() => send()} disabled={sending || !input.trim()} size="icon" className="h-11 w-11">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              {provider === "lovable" ? "Using Lovable AI (built-in)" : `Using your ${provider} key`} · AI can make mistakes. Verify critical decisions.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
