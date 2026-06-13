import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Activity, RotateCw, ServerOff, SkipForward, Loader2, Inbox } from "lucide-react";
import { SyncHealthRow, AccountHealth } from "./SyncHealthRow";
import { HealthTier } from "./healthScore";

type FilterKey = "all" | HealthTier | "silent" | "backlog";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "degraded", label: "Degraded" },
  { key: "healthy", label: "Healthy" },
  { key: "excellent", label: "Excellent" },
  { key: "backlog", label: "Backlog" },
  { key: "silent", label: "Silent / Skipped" },
  { key: "idle", label: "Idle" },
];

const TIER_RANK: Record<HealthTier, number> = { critical: 0, degraded: 1, healthy: 2, excellent: 3, idle: 4 };

interface Props {
  accounts: AccountHealth[];
  initialLoading: boolean;
  loading?: boolean;
  onRefresh: () => void;
}

export function SyncHealthMatrix({ accounts, initialLoading, loading = false, onRefresh }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: accounts.length, critical: 0, degraded: 0, healthy: 0, excellent: 0, idle: 0, silent: 0, backlog: 0 };
    for (const a of accounts) {
      const worst = TIER_RANK[a.fast.tier] < TIER_RANK[a.deep.tier] ? a.fast.tier : a.deep.tier;
      c[worst] = (c[worst] ?? 0) + 1;
      if (!a.activity.deep_dive_will_run) c.silent++;
      if (a.backlog_count > 0) c.backlog++;
    }
    return c;
  }, [accounts]);

  const skippedCount = counts.silent ?? 0;
  const backlogCount = counts.backlog ?? 0;

  const filtered = useMemo(() => {
    let list: AccountHealth[];
    if (filter === "all") list = accounts;
    else if (filter === "silent") list = accounts.filter(a => !a.activity.deep_dive_will_run);
    else if (filter === "backlog") list = accounts.filter(a => a.backlog_count > 0);
    else list = accounts.filter(a => a.fast.tier === filter || a.deep.tier === filter);

    return [...list].sort((a, b) => {
      const ra = Math.min(TIER_RANK[a.fast.tier], TIER_RANK[a.deep.tier]);
      const rb = Math.min(TIER_RANK[b.fast.tier], TIER_RANK[b.deep.tier]);
      if (ra !== rb) return ra - rb;
      return (a.fast.score + a.deep.score) - (b.fast.score + b.deep.score);
    });
  }, [accounts, filter]);

  if (initialLoading) {
    return (
      <div className="rounded-2xl border bg-card/40 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Account Health Matrix</h3>
        </div>
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted/40 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl border bg-card/40 p-8">
        <div className="flex flex-col items-center justify-center text-center gap-2">
          <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
            <ServerOff className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No accounts connected</p>
          <p className="text-xs text-muted-foreground max-w-xs">Connect Meta, TikTok, or Google in Integrations to start tracking per-lane health.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card/40 backdrop-blur-sm p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Account Health Matrix</h3>
          <Badge variant="outline" className="text-[10px] h-5">{accounts.length} accounts</Badge>
          {skippedCount > 0 && (
            <Badge variant="outline" className="text-[10px] h-5 gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
              <SkipForward className="h-2.5 w-2.5" /> {skippedCount} Deep-Dive skipped (saving quota)
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="h-7 text-xs gap-1"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map(f => {
          const count = counts[f.key] ?? 0;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-2.5 h-7 rounded-full text-[11px] font-medium border transition-all flex items-center gap-1.5",
                active ? "bg-primary text-primary-foreground border-primary shadow-sm"
                       : "bg-background hover:bg-muted/60 border-border/60",
                count === 0 && !active && "opacity-50",
              )}
            >
              {f.label}
              <span className={cn("tabular-nums text-[10px] px-1 rounded",
                active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="hidden md:grid grid-cols-12 gap-3 px-3.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        <div className="col-span-2">Account</div>
        <div className="col-span-2">Fast-Lane</div>
        <div className="col-span-3">Deep-Dive</div>
        <div className="col-span-3">Activity</div>
        <div className="col-span-2">Status</div>
      </div>

      <div className={cn(
        "space-y-2 max-h-[560px] overflow-y-auto pr-1 transition-opacity",
        loading && "opacity-60 pointer-events-none",
      )}>
        {filtered.map(acc => (
          <SyncHealthRow key={acc.ad_account_id} acc={acc} onRefresh={onRefresh} />
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-6">No accounts in this filter.</p>
        )}
      </div>
    </div>
  );
}
