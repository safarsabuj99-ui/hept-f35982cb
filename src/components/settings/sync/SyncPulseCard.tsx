import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, RotateCw, Activity, CheckCircle2, AlertTriangle, Zap, Trash2, Layers, Sparkles, Inbox } from "lucide-react";

interface PulseStats {
  pending: number;
  processing: number;
  done_24h: number;
  failed_24h: number;
  avg_ms: number;
  chunks_in_flight: number;
  backlog_total: number;
  auto_shrunk_24h: number;
}

interface Props {
  stats: PulseStats;
  loading: boolean;
  initialLoading: boolean;
  onRefresh: () => void;
  failedCount: number;
}

type Health = "healthy" | "active" | "degraded" | "failed";

export function SyncPulseCard({ stats, loading, initialLoading, onRefresh, failedCount }: Props) {
  const { toast } = useToast();
  const [action, setAction] = useState<string | null>(null);

  const health: Health =
    stats.failed_24h > 5 ? "failed" :
    stats.failed_24h > 0 ? "degraded" :
    stats.processing > 0 || stats.pending > 0 ? "active" : "healthy";

  const healthMeta: Record<Health, { label: string; dot: string; ring: string; glow: string; text: string }> = {
    healthy:  { label: "Sync Engine Healthy",   dot: "bg-emerald-500",   ring: "bg-emerald-500/40",  glow: "from-emerald-500/20 via-emerald-500/5 to-transparent", text: "text-emerald-500" },
    active:   { label: "Syncing in Progress",   dot: "bg-primary",       ring: "bg-primary/40",      glow: "from-primary/20 via-primary/5 to-transparent",         text: "text-primary" },
    degraded: { label: "Degraded Performance",  dot: "bg-amber-500",     ring: "bg-amber-500/40",    glow: "from-amber-500/20 via-amber-500/5 to-transparent",     text: "text-amber-500" },
    failed:   { label: "Sync Failures Detected", dot: "bg-destructive",  ring: "bg-destructive/40",  glow: "from-destructive/25 via-destructive/5 to-transparent", text: "text-destructive" },
  };

  const m = healthMeta[health];

  const handleDrain = async () => {
    setAction("drain");
    const { error } = await supabase.functions.invoke("sync-queue-worker", { body: {} });
    setAction(null);
    if (error) toast({ title: "Worker failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Worker triggered", description: "Processing queue now" }); setTimeout(onRefresh, 1500); }
  };

  const handleSyncAll = async () => {
    setAction("sync-all");
    const { error } = await supabase.functions.invoke("sync-orchestrator", { body: { function: "sync-deep-dive" } });
    setAction(null);
    if (error) toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Full sync queued", description: "All accounts queued for sync" }); setTimeout(onRefresh, 2000); }
  };

  const handleRetryAll = async () => {
    setAction("retry");
    const { error } = await (supabase.from("sync_jobs" as any) as any)
      .update({ status: "pending", attempts: 0, last_error: null, error_code: null, scheduled_at: new Date().toISOString(), completed_at: null, started_at: null })
      .eq("status", "failed");
    setAction(null);
    if (error) toast({ title: "Retry failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Failed jobs re-queued" }); onRefresh(); }
  };

  const handleClear = async () => {
    setAction("clear");
    const { error } = await supabase.from("sync_jobs" as any).delete().eq("status", "failed");
    setAction(null);
    if (error) toast({ title: "Clear failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Cleared", description: "Failed jobs removed" }); onRefresh(); }
  };

  const tiles = [
    { label: "Pending",   value: stats.pending,    accent: "text-foreground",   sub: stats.pending > 0 ? `~${Math.ceil(stats.pending / 4)} min to drain` : "queue empty" },
    { label: "Active",    value: stats.processing, accent: "text-primary",      sub: stats.processing > 0 ? "in flight" : "idle" },
    { label: "Done 24h",  value: stats.done_24h,   accent: "text-emerald-500",  sub: stats.avg_ms > 0 ? `avg ${(stats.avg_ms / 1000).toFixed(1)}s` : "—" },
    { label: "Errors 24h", value: stats.failed_24h, accent: stats.failed_24h > 0 ? "text-destructive" : "text-emerald-500", sub: stats.failed_24h === 0 ? "all clean" : "needs attention" },
  ];

  return (
    <div className="relative ios-glass-card rounded-2xl p-6 overflow-hidden">
      {/* Adaptive ambient glow */}
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-100 transition-all duration-700", m.glow)} />
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl opacity-40 transition-all duration-700"
           style={{ background: `radial-gradient(circle, var(--tw-gradient-from), transparent 70%)` }} />

      <div className="relative space-y-5">
        {/* Header — pulse + status */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", m.ring)} />
              <span className={cn("relative inline-flex rounded-full h-3 w-3", m.dot)} />
            </span>
            <div>
              <h2 className={cn("text-lg font-semibold tracking-tight", m.text)}>{m.label}</h2>
              <p className="text-xs text-muted-foreground">Live chunk-aware sync engine · auto-refresh 5s</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading} className="h-8">
            <RotateCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {tiles.map(t => (
            <div key={t.label} className="ios-glass-pill rounded-xl p-3.5 transition-all hover:scale-[1.02] hover:shadow-lg">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{t.label}</p>
              <p className={cn("text-3xl font-bold tabular-nums mt-1.5 transition-all", t.accent)}>
                {initialLoading ? <span className="inline-block h-8 w-12 rounded bg-muted/60 animate-pulse" /> : t.value.toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">{t.sub}</p>
            </div>
          ))}
        </div>

        {/* Primary actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={handleDrain} disabled={!!action || stats.pending === 0} size="sm" className="gap-1.5 shadow-md hover:shadow-lg transition-shadow">
            {action === "drain" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Drain Now
          </Button>
          <Button onClick={handleSyncAll} disabled={!!action} variant="outline" size="sm" className="gap-1.5">
            {action === "sync-all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
            Sync Everything
          </Button>
          {failedCount > 0 && (
            <>
              <Button onClick={handleRetryAll} disabled={!!action} variant="outline" size="sm" className="gap-1.5">
                {action === "retry" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                Retry All ({failedCount})
              </Button>
              <Button onClick={handleClear} disabled={!!action} variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10">
                {action === "clear" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Clear
              </Button>
            </>
          )}
          {!initialLoading && health === "healthy" && stats.done_24h === 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Queue idle
            </div>
          )}
          {health === "failed" && (
            <div className="flex items-center gap-1.5 text-xs text-destructive ml-auto">
              <AlertTriangle className="h-3.5 w-3.5" /> Investigate errors below
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
