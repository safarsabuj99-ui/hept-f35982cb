import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, RotateCw, CheckCircle2, ShieldAlert, Activity, Inbox } from "lucide-react";

export interface AccountProgress {
  ad_account_id: string;
  account_name: string;
  total: number;
  done: number;
  failed: number;
  pending: number;
  processing: number;
  avg_rows_per_day?: number;
  recommended_chunk_days?: number;
  last_full_sync_at?: string | null;
  has_alert?: boolean;
}

interface Props {
  accounts: AccountProgress[];
  initialLoading: boolean;
  onRefresh: () => void;
}

export function SyncAccountsRail({ accounts, initialLoading, onRefresh }: Props) {
  const { toast } = useToast();
  const [retrying, setRetrying] = useState<string | null>(null);

  const handleForce = async (id: string, name: string) => {
    setRetrying(id);
    await supabase.from("sync_account_stats" as any).update({ avg_rows_per_day: 0, consecutive_failures: 0, recommended_chunk_days: 5 }).eq("ad_account_id", id);
    const { error } = await supabase.functions.invoke("sync-orchestrator", { body: { function: "sync-deep-dive" } });
    setRetrying(null);
    if (error) toast({ title: "Re-sync failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Re-sync queued", description: `${name} queued in 5-day chunks` }); setTimeout(onRefresh, 1500); }
  };

  if (initialLoading) {
    return (
      <div className="rounded-2xl border bg-card/40 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Live Account Sync</h3>
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl border bg-card/40 p-8">
        <div className="flex flex-col items-center justify-center text-center gap-2">
          <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No active syncs</p>
          <p className="text-xs text-muted-foreground">When a sync starts, you'll see chunked progress here in real time.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card/40 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary animate-pulse" />
          <h3 className="text-sm font-semibold">Live Account Sync</h3>
          <Badge variant="outline" className="text-[10px] h-5">{accounts.length}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 text-xs"><RotateCw className="h-3 w-3" /></Button>
      </div>

      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
        {accounts.map(p => {
          const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
          const inProgress = p.pending + p.processing > 0;
          const allDone = !inProgress && p.failed === 0 && p.done > 0;
          const hasFailures = p.failed > 0;

          return (
            <div
              key={p.ad_account_id}
              className={cn(
                "group relative rounded-xl border p-3.5 transition-all duration-300 animate-fade-in",
                inProgress && "border-primary/30 bg-primary/5 shadow-sm",
                allDone && "border-emerald-500/20 bg-emerald-500/5",
                hasFailures && "border-destructive/30 bg-destructive/5",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-medium text-sm truncate">{p.account_name}</span>
                  {p.has_alert && (
                    <Badge variant="destructive" className="text-[9px] h-5 px-1.5 gap-0.5">
                      <ShieldAlert className="h-2.5 w-2.5" /> alert
                    </Badge>
                  )}
                  {inProgress ? (
                    <Badge variant="outline" className="text-[9px] h-5 px-1.5 gap-1 text-primary border-primary/40 bg-primary/10">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" /> syncing
                    </Badge>
                  ) : allDone ? (
                    <Badge variant="outline" className="text-[9px] h-5 px-1.5 gap-1 text-emerald-600 border-emerald-500/40 bg-emerald-500/10">
                      <CheckCircle2 className="h-2.5 w-2.5" /> verified
                    </Badge>
                  ) : hasFailures ? (
                    <Badge variant="destructive" className="text-[9px] h-5 px-1.5">{p.failed} failed</Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-xs font-semibold tabular-nums">{p.done}/{p.total}<span className="text-muted-foreground font-normal"> chunks</span></p>
                    {p.recommended_chunk_days != null && (
                      <p className="text-[9px] text-muted-foreground">{p.recommended_chunk_days}-day windows</p>
                    )}
                  </div>
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={retrying === p.ad_account_id}
                    onClick={() => handleForce(p.ad_account_id, p.account_name)}
                    title="Force full re-sync"
                  >
                    {retrying === p.ad_account_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              {/* Premium animated progress bar */}
              <div className="mt-2.5 h-2 rounded-full bg-muted/50 overflow-hidden relative">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700 relative overflow-hidden",
                    inProgress ? "bg-gradient-to-r from-primary/70 to-primary" :
                    hasFailures ? "bg-gradient-to-r from-destructive/70 to-destructive" :
                    "bg-gradient-to-r from-emerald-500/70 to-emerald-500"
                  )}
                  style={{ width: `${Math.max(pct, inProgress ? 4 : 0)}%` }}
                >
                  {inProgress && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_1.8s_infinite]" />
                  )}
                </div>
              </div>

              {(p.avg_rows_per_day != null && p.avg_rows_per_day > 0) || p.last_full_sync_at ? (
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {p.avg_rows_per_day != null && p.avg_rows_per_day > 0 && <>~{Math.round(p.avg_rows_per_day)} rows/day</>}
                  {p.avg_rows_per_day != null && p.avg_rows_per_day > 0 && p.last_full_sync_at && " · "}
                  {p.last_full_sync_at && <>last full {formatDistanceToNow(new Date(p.last_full_sync_at), { addSuffix: true })}</>}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
