import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Loader2, ShieldCheck, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type PendingAction = {
  id: string;
  tool_name: string;
  summary: string;
  args: any;
  status: string;
  created_at: string;
  result?: any;
  error?: string;
};

const PROJECT_URL = "https://hhpiimnvkgmpfnldgdhc.supabase.co";

export function NovaPendingActions({ compact = false }: { compact?: boolean }) {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ai_pending_actions")
      .select("id, tool_name, summary, args, status, created_at, result, error")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);
    setActions((data || []) as PendingAction[]);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`nova-pending-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_pending_actions", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const decide = async (id: string, decision: "approve" | "reject") => {
    setBusyId(id);
    try {
      const res = await fetch(`${PROJECT_URL}/functions/v1/ai-action-execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ proposal_id: id, decision }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed");
      toast({
        title: decision === "approve" ? (json.ok ? "Action executed" : "Action approved but failed") : "Action rejected",
        description: json.error || json.result?.note || "",
        variant: json.ok || decision === "reject" ? "default" : "destructive",
      });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (actions.length === 0) return null;

  return (
    <Card className={cn("border-amber-500/40 bg-gradient-to-br from-amber-500/5 to-transparent", compact && "shadow-none")}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <ShieldCheck className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold">Nova wants to act</span>
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300">
          {actions.length} pending
        </Badge>
        <Sparkles className="h-3 w-3 text-amber-500/60 ml-1" />
        {open ? <ChevronUp className="h-4 w-4 ml-auto text-muted-foreground" /> : <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {actions.map((a) => (
            <div key={a.id} className="rounded-lg border border-border/60 bg-background/80 p-2.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{a.tool_name}</code>
                    <span className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs leading-snug text-foreground">{a.summary}</p>
                  {a.args && Object.keys(a.args).length > 0 && (
                    <details className="mt-1">
                      <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">View payload</summary>
                      <pre className="mt-1 bg-muted/40 rounded p-1.5 text-[10px] leading-tight overflow-x-auto max-h-32">{JSON.stringify(a.args, null, 2)}</pre>
                    </details>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 mt-2">
                <Button
                  size="sm" variant="default"
                  className="h-7 px-2.5 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={busyId === a.id}
                  onClick={() => decide(a.id, "approve")}
                >
                  {busyId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Approve
                </Button>
                <Button
                  size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1"
                  disabled={busyId === a.id}
                  onClick={() => decide(a.id, "reject")}
                >
                  <X className="h-3 w-3" /> Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
