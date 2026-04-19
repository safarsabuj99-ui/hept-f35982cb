import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, RotateCw, ChevronDown, AlertTriangle, Zap, Layers } from "lucide-react";
import { LaneHealth, TIER_META } from "./healthScore";

export interface AccountHealth {
  ad_account_id: string;
  account_name: string;
  platform: string | null;
  fast: LaneHealth;
  deep: LaneHealth;
  issue: string | null;
  token_expiring_in_days: number | null;
}

function LanePill({ lane, label, icon: Icon }: { lane: LaneHealth; label: string; icon: React.ElementType }) {
  const meta = TIER_META[lane.tier];
  const pct = lane.total > 0 ? Math.round((lane.done / lane.total) * 100) : 0;
  const ago = lane.last_done_at ? formatDistanceToNow(new Date(lane.last_done_at), { addSuffix: false }) : "—";

  return (
    <div className={cn("rounded-lg border p-2.5 transition-all", lane.tier === "critical" && "border-destructive/30 bg-destructive/5")}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
          <Icon className="h-3 w-3" /> {label}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", meta.dot)}>
            {lane.is_syncing && (
              <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping", meta.dot)} />
            )}
          </span>
          <span className={cn("text-xs font-semibold", meta.tone)}>{meta.label}</span>
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold tabular-nums">{lane.tier === "idle" ? "—" : `${lane.score}%`}</span>
        <span className="text-[10px] text-muted-foreground">
          {lane.tier === "idle" ? "no jobs 24h" : lane.last_done_at ? `${ago} ago` : "never"}
        </span>
      </div>
      {lane.total > 0 && (
        <div className="mt-1.5 h-1 rounded-full bg-muted/50 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all",
              lane.tier === "excellent" || lane.tier === "healthy" ? "bg-emerald-500" :
              lane.tier === "degraded" ? "bg-amber-500" : "bg-destructive")}
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function SyncHealthRow({ acc, onRefresh }: { acc: AccountHealth; onRefresh: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState<"fast" | "deep" | null>(null);

  const handleRetry = async (lane: "fast" | "deep") => {
    setRetrying(lane);
    const fn = lane === "fast" ? "sync-fast-lane" : "sync-deep-dive";
    const { error } = await supabase.functions.invoke("sync-orchestrator", { body: { function: fn } });
    setRetrying(null);
    if (error) toast({ title: "Re-sync failed", description: error.message, variant: "destructive" });
    else { toast({ title: `${lane === "fast" ? "Fast-Lane" : "Deep-Dive"} queued`, description: acc.account_name }); setTimeout(onRefresh, 1500); }
  };

  const isCritical = acc.fast.tier === "critical" || acc.deep.tier === "critical";

  return (
    <div className={cn(
      "rounded-xl border bg-card/40 transition-all animate-fade-in overflow-hidden",
      isCritical && "border-destructive/30 shadow-[0_0_0_1px_hsl(var(--destructive)/0.15)]",
    )}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-3.5 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="grid grid-cols-12 gap-3 items-center">
          <div className="col-span-12 md:col-span-3 min-w-0">
            <div className="flex items-center gap-2">
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
              <span className="font-medium text-sm truncate">{acc.account_name}</span>
            </div>
            {acc.platform && <span className="text-[10px] text-muted-foreground capitalize ml-5">{acc.platform}</span>}
          </div>
          <div className="col-span-6 md:col-span-3"><LanePill lane={acc.fast} label="Fast-Lane" icon={Zap} /></div>
          <div className="col-span-6 md:col-span-3"><LanePill lane={acc.deep} label="Deep-Dive" icon={Layers} /></div>
          <div className="col-span-12 md:col-span-3 min-w-0">
            {acc.issue ? (
              <Badge variant={isCritical ? "destructive" : "outline"} className="gap-1 max-w-full">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="truncate text-[10px]">{acc.issue}</span>
              </Badge>
            ) : (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">— No issues</span>
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t bg-muted/20 p-3.5 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1.5"><Zap className="h-3 w-3" /> Fast-Lane (24h)</span>
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1"
                  disabled={retrying === "fast"} onClick={(e) => { e.stopPropagation(); handleRetry("fast"); }}>
                  {retrying === "fast" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                  Re-sync
                </Button>
              </div>
              <Stat l="Done" v={acc.fast.done} /><Stat l="Failed" v={acc.fast.failed} tone={acc.fast.failed > 0 ? "destructive" : undefined} />
              <Stat l="Pending" v={acc.fast.pending} /><Stat l="Processing" v={acc.fast.processing} />
              {acc.fast.last_error && <p className="text-[10px] text-destructive break-words">⚠ {acc.fast.last_error}</p>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1.5"><Layers className="h-3 w-3" /> Deep-Dive (24h)</span>
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1"
                  disabled={retrying === "deep"} onClick={(e) => { e.stopPropagation(); handleRetry("deep"); }}>
                  {retrying === "deep" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                  Re-sync
                </Button>
              </div>
              <Stat l="Done" v={acc.deep.done} /><Stat l="Failed" v={acc.deep.failed} tone={acc.deep.failed > 0 ? "destructive" : undefined} />
              <Stat l="Pending" v={acc.deep.pending} /><Stat l="Processing" v={acc.deep.processing} />
              {acc.deep.last_error && <p className="text-[10px] text-destructive break-words">⚠ {acc.deep.last_error}</p>}
            </div>
          </div>
          {acc.token_expiring_in_days !== null && acc.token_expiring_in_days <= 14 && (
            <div className={cn("mt-3 rounded-md p-2 text-[11px] flex items-center gap-2",
              acc.token_expiring_in_days <= 0 ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {acc.token_expiring_in_days <= 0 ? "API token has expired — refresh in Integrations." : `API token expires in ${acc.token_expiring_in_days} day(s) — refresh soon.`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ l, v, tone }: { l: string; v: number; tone?: "destructive" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{l}</span>
      <span className={cn("font-semibold tabular-nums", tone === "destructive" && "text-destructive")}>{v}</span>
    </div>
  );
}
