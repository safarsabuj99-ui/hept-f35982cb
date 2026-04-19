import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Activity, RotateCw, ServerOff } from "lucide-react";
import { SyncHealthRow, AccountHealth } from "./SyncHealthRow";
import { HealthTier } from "./healthScore";

const FILTERS: { key: "all" | HealthTier; label: string }[] = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "degraded", label: "Degraded" },
  { key: "healthy", label: "Healthy" },
  { key: "excellent", label: "Excellent" },
  { key: "idle", label: "Idle" },
];

const TIER_RANK: Record<HealthTier, number> = { critical: 0, degraded: 1, healthy: 2, excellent: 3, idle: 4 };

interface Props {
  accounts: AccountHealth[];
  initialLoading: boolean;
  onRefresh: () => void;
}

export function SyncHealthMatrix({ accounts, initialLoading, onRefresh }: Props) {
  const [filter, setFilter] = useState<"all" | HealthTier>("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: accounts.length, critical: 0, degraded: 0, healthy: 0, excellent: 0, idle: 0 };
    for (const a of accounts) {
      const worst = TIER_RANK[a.fast.tier] < TIER_RANK[a.deep.tier] ? a.fast.tier : a.deep.tier;
      c[worst] = (c[worst] ?? 0) + 1;
    }
    return c;
  }, [accounts]);

  const filtered = useMemo(() => {
    const list = filter === "all"
      ? accounts
      : accounts.filter(a => a.fast.tier === filter || a.deep.tier === filter);
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
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 text-xs gap-1">
          <RotateCw className="h-3 w-3" /> Refresh
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
        <div className="col-span-3">Account</div>
        <div className="col-span-3">Fast-Lane</div>
        <div className="col-span-3">Deep-Dive</div>
        <div className="col-span-3">Last Issue</div>
      </div>

      <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
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
