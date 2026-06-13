import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, RotateCw, ChevronDown, AlertTriangle, Zap, Layers, Activity, SkipForward, CheckCircle2, Sparkles, Inbox, Scissors } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { LaneHealth, TIER_META, ActivitySignal, ACTIVITY_META, formatAgoCompact } from "./healthScore";

export interface BacklogEntry {
  data_date: string;
  attempts: number;
  next_retry_at: string;
  last_error: string | null;
}

export interface AccountHealth {
  ad_account_id: string;
  account_name: string;
  platform: string | null;
  fast: LaneHealth;
  deep: LaneHealth;
  activity: ActivitySignal;
  issue: string | null;
  token_expiring_in_days: number | null;
  backlog_count: number;
  backlog_next_retry_at: string | null;
  backlog_entries: BacklogEntry[];
  current_chunk_days: number | null;
  splits_24h: number;
  self_healed: boolean;
}


function LanePill({ lane, label, icon: Icon }: { lane: LaneHealth; label: string; icon: React.ElementType }) {
  const meta = TIER_META[lane.tier];
  const pct = lane.total > 0 ? Math.round((lane.done / lane.total) * 100) : 0;
  const ago = lane.last_done_at ? formatAgoCompact(lane.last_done_at) : "—";

  return (
    <div className={cn("rounded-lg border p-2.5 transition-all min-w-0", lane.tier === "critical" && "border-destructive/30 bg-destructive/5")}>
      <div className="flex items-center justify-between gap-1.5 mb-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide min-w-0 truncate">
          <Icon className="h-3 w-3 shrink-0" /> <span className="truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", meta.dot)}>
            {lane.is_syncing && (
              <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping", meta.dot)} />
            )}
          </span>
          <span className={cn("text-xs font-semibold", meta.tone)}>{meta.label}</span>
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="text-sm font-bold tabular-nums shrink-0">{lane.tier === "idle" ? "—" : `${lane.score}%`}</span>
        <span className="text-[10px] text-muted-foreground truncate min-w-0 text-right tabular-nums">
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

function ActivityPill({ activity }: { activity: ActivitySignal }) {
  const meta = ACTIVITY_META[activity.tier];
  const ago = activity.last_fast_lane_at ? formatAgoCompact(activity.last_fast_lane_at) : null;

  const subline = (() => {
    if (activity.tier === "live") return `${activity.last_fast_lane_rows} row${activity.last_fast_lane_rows === 1 ? "" : "s"}`;
    if (activity.tier === "quiet") return `${activity.consecutive_zero_runs} silent run${activity.consecutive_zero_runs === 1 ? "" : "s"}`;
    if (activity.tier === "silent") {
      const hh = activity.hours_until_heartbeat;
      return hh !== null ? `Heartbeat in ${hh < 1 ? "<1" : Math.floor(hh)}h` : "Skipped";
    }
    if (activity.tier === "dormant") return "Heartbeat fires";
    return "Awaiting first run";
  })();

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "rounded-lg border p-2.5 transition-all cursor-help",
            (activity.tier === "silent" || activity.tier === "dormant") && "border-amber-500/20 bg-amber-500/5",
          )}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                <Activity className="h-3 w-3" /> Activity
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn("inline-flex h-2 w-2 rounded-full", meta.dot)} />
                <span className={cn("text-xs font-semibold", meta.tone)}>{meta.label}</span>
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-2 min-w-0">
              <span className="text-[11px] font-medium truncate min-w-0">{subline}</span>
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                {ago ? `${ago} ago` : "never"}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[10px]">
              {activity.deep_dive_will_run ? (
                <>
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Deep-Dive on</span>
                </>
              ) : (
                <>
                  <SkipForward className="h-2.5 w-2.5 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Deep-Dive skipped</span>
                </>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {meta.description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function EnginePill({ acc }: { acc: AccountHealth }) {
  const chunk = acc.current_chunk_days;
  const chunkLabel = chunk == null ? "—" : `${chunk}d`;
  const heavy = chunk != null && chunk <= 3;
  const nextRetry = acc.backlog_next_retry_at
    ? formatDistanceToNow(new Date(acc.backlog_next_retry_at), { addSuffix: false })
    : null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "rounded-lg border p-2.5 transition-all cursor-help",
            acc.backlog_count > 0 && "border-amber-500/30 bg-amber-500/5",
            acc.self_healed && acc.backlog_count === 0 && "border-emerald-500/25 bg-emerald-500/5",
          )}>
            <div className="flex items-center justify-between gap-1.5 mb-1">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                <Sparkles className="h-3 w-3" /> Engine
              </div>
              <span className={cn(
                "text-[10px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full tabular-nums",
                heavy ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {chunkLabel}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2 min-w-0">
              <span className="text-[11px] font-medium truncate">
                {acc.backlog_count > 0
                  ? `${acc.backlog_count} day${acc.backlog_count === 1 ? "" : "s"} queued`
                  : acc.self_healed
                  ? "Self-healing"
                  : acc.splits_24h > 0
                  ? `${acc.splits_24h} split${acc.splits_24h === 1 ? "" : "s"}`
                  : "Stable"}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                {nextRetry ? `in ${nextRetry}` : ""}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[10px]">
              {acc.backlog_count > 0 ? (
                <>
                  <Inbox className="h-2.5 w-2.5 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Backlog draining</span>
                </>
              ) : acc.self_healed ? (
                <>
                  <Sparkles className="h-2.5 w-2.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Auto-healed</span>
                </>
              ) : heavy ? (
                <>
                  <Scissors className="h-2.5 w-2.5 text-primary" />
                  <span className="text-primary font-medium">Small chunks</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                  <span className="text-muted-foreground">{chunkLabel} windows</span>
                </>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          Engine collapses chunk windows when a job times out. Heavy accounts settle at 1–3 day windows; failed single days move to backlog with exponential backoff.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SyncHealthRow({ acc, onRefresh }: { acc: AccountHealth; onRefresh: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState<"fast" | "deep" | "backlog" | null>(null);

  const handleRetry = async (lane: "fast" | "deep") => {
    setRetrying(lane);
    const fn = lane === "fast" ? "sync-fast-lane" : "sync-deep-dive";
    const { error } = await supabase.functions.invoke("sync-orchestrator", { body: { function: fn } });
    setRetrying(null);
    if (error) toast({ title: "Re-sync failed", description: error.message, variant: "destructive" });
    else { toast({ title: `${lane === "fast" ? "Fast-Lane" : "Deep-Dive"} queued`, description: acc.account_name }); setTimeout(onRefresh, 1500); }
  };

  const handleDrainBacklog = async () => {
    setRetrying("backlog");
    const { error } = await supabase.functions.invoke("sync-orchestrator", { body: { function: "sync-deep-dive", drainBacklog: true } });
    setRetrying(null);
    if (error) toast({ title: "Drain failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Backlog draining", description: acc.account_name }); setTimeout(onRefresh, 1500); }
  };

  const isCritical = acc.fast.tier === "critical" || acc.deep.tier === "critical";
  const isSkipped = !acc.activity.deep_dive_will_run;
  const isAutoSplitting = acc.splits_24h > 0 && (acc.deep.tier === "degraded" || acc.deep.tier === "critical");

  return (
    <div className={cn(
      "rounded-xl border bg-card/40 transition-all animate-fade-in overflow-hidden",
      isCritical && !acc.self_healed && "border-destructive/30 shadow-[0_0_0_1px_hsl(var(--destructive)/0.15)]",
      acc.self_healed && "border-emerald-500/25",
    )}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-3.5 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="grid grid-cols-12 gap-3 items-center">
          <div className="col-span-12 md:col-span-2 min-w-0">
            <div className="flex items-center gap-2">
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
              <span className="font-medium text-sm truncate">{acc.account_name}</span>
            </div>
            {acc.platform && <span className="text-[10px] text-muted-foreground capitalize ml-5">{acc.platform}</span>}
          </div>
          <div className="col-span-6 md:col-span-2"><LanePill lane={acc.fast} label="Fast-Lane" icon={Zap} /></div>
          <div className="col-span-6 md:col-span-2">
            <div className={cn(isSkipped && "opacity-60")}>
              <LanePill lane={acc.deep} label="Deep-Dive" icon={Layers} />
            </div>
          </div>
          <div className="col-span-6 md:col-span-2"><EnginePill acc={acc} /></div>
          <div className="col-span-6 md:col-span-2"><ActivityPill activity={acc.activity} /></div>
          <div className="col-span-6 md:col-span-2 min-w-0">
            {isAutoSplitting ? (
              <Badge variant="outline" className="gap-1 max-w-full border-primary/30 text-primary bg-primary/5">
                <Scissors className="h-3 w-3 shrink-0" />
                <span className="truncate text-[10px]">Auto-splitting</span>
              </Badge>
            ) : acc.issue ? (
              <Badge variant={isCritical ? "destructive" : "outline"} className="gap-1 max-w-full">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="truncate text-[10px]">{acc.issue}</span>
              </Badge>
            ) : acc.self_healed ? (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Self-healed
              </span>
            ) : isSkipped ? (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <SkipForward className="h-3 w-3" /> Saving quota
              </span>
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
                <span className="font-semibold flex items-center gap-1.5">
                  <Layers className="h-3 w-3" /> Deep-Dive (24h)
                  {isSkipped && (
                    <Badge variant="outline" className="h-4 text-[9px] gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
                      <SkipForward className="h-2.5 w-2.5" /> Skipped
                    </Badge>
                  )}
                </span>
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1"
                  disabled={retrying === "deep"} onClick={(e) => { e.stopPropagation(); handleRetry("deep"); }}>
                  {retrying === "deep" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                  Force Run
                </Button>
              </div>
              <Stat l="Done" v={acc.deep.done} /><Stat l="Failed" v={acc.deep.failed} tone={acc.deep.failed > 0 ? "destructive" : undefined} />
              <Stat l="Pending" v={acc.deep.pending} /><Stat l="Processing" v={acc.deep.processing} />
              {acc.deep.last_error && <p className="text-[10px] text-destructive break-words">⚠ {acc.deep.last_error}</p>}
            </div>
          </div>

          {/* Activity intelligence panel */}
          <div className="mt-3 rounded-md p-2.5 bg-background/60 border border-border/40 text-[11px]">
            <div className="flex items-center gap-1.5 mb-1.5 font-semibold">
              <Activity className="h-3 w-3 text-primary" />
              Smart Deep-Dive Gating
            </div>
            <p className="text-muted-foreground leading-relaxed">
              {ACTIVITY_META[acc.activity.tier].description}.{" "}
              {acc.activity.last_fast_lane_at && (
                <>Last Fast-Lane returned <span className="font-semibold text-foreground">{acc.activity.last_fast_lane_rows}</span> row{acc.activity.last_fast_lane_rows === 1 ? "" : "s"}{acc.activity.consecutive_zero_runs > 0 && <> · <span className="text-amber-600 dark:text-amber-400">{acc.activity.consecutive_zero_runs}</span> consecutive zero-run{acc.activity.consecutive_zero_runs === 1 ? "" : "s"}</>}.</>
              )}
            </p>
          </div>

          {/* Self-Heal Timeline */}
          <div className="mt-3 rounded-md p-2.5 bg-background/60 border border-border/40 text-[11px]">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 font-semibold">
                <Sparkles className="h-3 w-3 text-primary" />
                Self-Heal Timeline
              </div>
              {acc.backlog_count > 0 && (
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1"
                  disabled={retrying === "backlog"} onClick={(e) => { e.stopPropagation(); handleDrainBacklog(); }}>
                  {retrying === "backlog" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Inbox className="h-3 w-3" />}
                  Drain backlog now
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              <Stat l="Chunk size" v={acc.current_chunk_days ?? 0} />
              <Stat l="Splits 24h" v={acc.splits_24h} />
              <Stat l="Backlog" v={acc.backlog_count} tone={acc.backlog_count > 0 ? "destructive" : undefined} />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Next retry</span>
                <span className="font-semibold tabular-nums text-[10px]">
                  {acc.backlog_next_retry_at ? formatDistanceToNow(new Date(acc.backlog_next_retry_at), { addSuffix: true }) : "—"}
                </span>
              </div>
            </div>
            {acc.backlog_entries.length > 0 ? (
              <div className="space-y-1 mt-2 border-t border-border/40 pt-2">
                {acc.backlog_entries.map(b => (
                  <div key={b.data_date} className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="font-mono text-foreground">{b.data_date}</span>
                    <span className="text-muted-foreground">attempt {b.attempts}/5</span>
                    <span className="text-amber-600 dark:text-amber-400 tabular-nums">
                      next {formatDistanceToNow(new Date(b.next_retry_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground leading-relaxed">
                {acc.self_healed
                  ? `Engine auto-split ${acc.splits_24h} window${acc.splits_24h === 1 ? "" : "s"} in the last 24h and recovered without manual action.`
                  : acc.current_chunk_days && acc.current_chunk_days <= 3
                  ? `Heavy account — engine is using ${acc.current_chunk_days}-day windows to stay within timeouts.`
                  : `Healthy — engine is running at ${acc.current_chunk_days ?? 25}-day windows. No backlog.`}
              </p>
            )}
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
