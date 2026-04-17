import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, ListChecks, Trash2, RotateCw, AlertCircle, CheckCircle2, Activity, ShieldAlert } from "lucide-react";

interface QueueStats {
  pending: number;
  processing: number;
  failed_24h: number;
  done_24h: number;
  avg_ms: number;
}

interface FailedJob {
  id: string;
  ad_account_id: string;
  function_name: string;
  attempts: number;
  last_error: string | null;
  error_code: string | null;
  completed_at: string | null;
  date_from: string | null;
  date_to: string | null;
  chunk_index: number | null;
  chunk_total: number | null;
  account_name?: string;
}

interface AccountProgress {
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

export function SyncQueueHealthCard() {
  const { toast } = useToast();
  const [stats, setStats] = useState<QueueStats>({ pending: 0, processing: 0, failed_24h: 0, done_24h: 0, avg_ms: 0 });
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [accountProgress, setAccountProgress] = useState<AccountProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchQueueData = async () => {
    setLoading(true);
    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [pendingRes, processingRes, failedRes, doneRes, jobsRes, activeJobsRes, statsRes, alertsRes] = await Promise.all([
        supabase.from("sync_jobs" as any).select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("sync_jobs" as any).select("id", { count: "exact", head: true }).eq("status", "processing"),
        supabase.from("sync_jobs" as any).select("id", { count: "exact", head: true }).eq("status", "failed").gte("completed_at", since24h),
        supabase.from("sync_jobs" as any).select("id, started_at, completed_at", { count: "exact" }).eq("status", "done").gte("completed_at", since24h).limit(100),
        supabase.from("sync_jobs" as any).select("id, ad_account_id, function_name, attempts, last_error, error_code, completed_at, date_from, date_to, chunk_index, chunk_total").eq("status", "failed").order("completed_at", { ascending: false }).limit(20),
        supabase.from("sync_jobs" as any).select("ad_account_id, status, parent_job_id").in("status", ["pending", "processing", "done", "failed"]).gte("scheduled_at", since24h),
        supabase.from("sync_account_stats" as any).select("ad_account_id, avg_rows_per_day, recommended_chunk_days, last_full_sync_at"),
        supabase.from("sync_integrity_alerts" as any).select("ad_account_id").eq("resolved", false),
      ]);

      const doneRows = (doneRes.data ?? []) as any[];
      let avgMs = 0;
      if (doneRows.length > 0) {
        const durations = doneRows
          .filter(r => r.started_at && r.completed_at)
          .map(r => new Date(r.completed_at).getTime() - new Date(r.started_at).getTime());
        avgMs = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
      }

      setStats({
        pending: pendingRes.count ?? 0,
        processing: processingRes.count ?? 0,
        failed_24h: failedRes.count ?? 0,
        done_24h: doneRes.count ?? 0,
        avg_ms: avgMs,
      });

      // Build per-account progress map
      const activeJobs = (activeJobsRes.data ?? []) as any[];
      const statsRows = (statsRes.data ?? []) as any[];
      const alertSet = new Set(((alertsRes.data ?? []) as any[]).map(a => a.ad_account_id));
      const statsMap = new Map(statsRows.map(s => [s.ad_account_id, s]));

      const progMap = new Map<string, AccountProgress>();
      for (const j of activeJobs) {
        if (!j.parent_job_id) continue; // only chunked
        const acc = j.ad_account_id;
        if (!progMap.has(acc)) {
          const st = statsMap.get(acc) as any;
          progMap.set(acc, {
            ad_account_id: acc,
            account_name: acc,
            total: 0, done: 0, failed: 0, pending: 0, processing: 0,
            avg_rows_per_day: st?.avg_rows_per_day,
            recommended_chunk_days: st?.recommended_chunk_days,
            last_full_sync_at: st?.last_full_sync_at,
            has_alert: alertSet.has(acc),
          });
        }
        const p = progMap.get(acc)!;
        p.total++;
        if (j.status === "done") p.done++;
        else if (j.status === "failed") p.failed++;
        else if (j.status === "pending") p.pending++;
        else if (j.status === "processing") p.processing++;
      }

      // Enrich with account names
      const allAccountIds = [
        ...new Set([
          ...((jobsRes.data ?? []) as any[]).map(j => j.ad_account_id),
          ...Array.from(progMap.keys()),
        ]),
      ];
      let nameMap = new Map<string, string>();
      if (allAccountIds.length > 0) {
        const { data: accounts } = await supabase.from("ad_accounts").select("id, account_name").in("id", allAccountIds);
        nameMap = new Map((accounts ?? []).map(a => [a.id, a.account_name]));
      }

      const failed = (jobsRes.data ?? []) as unknown as FailedJob[];
      setFailedJobs(failed.map(j => ({ ...j, account_name: nameMap.get(j.ad_account_id) ?? j.ad_account_id })));

      const progArr = Array.from(progMap.values()).map(p => ({
        ...p,
        account_name: nameMap.get(p.ad_account_id) ?? p.ad_account_id,
      }));
      // Show in-progress accounts first
      progArr.sort((a, b) => (b.pending + b.processing) - (a.pending + a.processing));
      setAccountProgress(progArr.slice(0, 10));
    } catch (err) {
      console.error("Failed to load queue data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchQueueData();
    const interval = setInterval(fetchQueueData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleRetryAll = async () => {
    setActionLoading("retry-all");
    const { error } = await (supabase.from("sync_jobs" as any) as any)
      .update({ status: "pending", attempts: 0, last_error: null, error_code: null, scheduled_at: new Date().toISOString(), completed_at: null, started_at: null })
      .eq("status", "failed");
    setActionLoading(null);
    if (error) toast({ title: "Retry failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Retry queued", description: `${failedJobs.length} jobs reset to pending` }); fetchQueueData(); }
  };

  const handleClearFailed = async () => {
    setActionLoading("clear-failed");
    const { error } = await supabase.from("sync_jobs" as any).delete().eq("status", "failed");
    setActionLoading(null);
    if (error) toast({ title: "Clear failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Cleared", description: "All failed jobs removed" }); fetchQueueData(); }
  };

  const handleRetryOne = async (jobId: string) => {
    setActionLoading(jobId);
    const { error } = await (supabase.from("sync_jobs" as any) as any)
      .update({ status: "pending", attempts: 0, last_error: null, error_code: null, scheduled_at: new Date().toISOString(), completed_at: null, started_at: null })
      .eq("id", jobId);
    setActionLoading(null);
    if (error) toast({ title: "Retry failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Job re-queued" }); fetchQueueData(); }
  };

  const handleDrainNow = async () => {
    setActionLoading("drain");
    const { error } = await supabase.functions.invoke("sync-queue-worker", { body: {} });
    setActionLoading(null);
    if (error) toast({ title: "Worker failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Worker triggered", description: "Processing queue" }); setTimeout(fetchQueueData, 2000); }
  };

  const handleForceReSync = async (accountId: string) => {
    setActionLoading(`force-${accountId}`);
    // Reset stats so next orchestrator run treats as unknown (5-day chunks)
    const { error: e1 } = await supabase.from("sync_account_stats" as any)
      .update({ avg_rows_per_day: 0, consecutive_failures: 0, recommended_chunk_days: 5 })
      .eq("ad_account_id", accountId);
    // Trigger orchestrator
    const { error: e2 } = await supabase.functions.invoke("sync-orchestrator", { body: { function: "sync-deep-dive" } });
    setActionLoading(null);
    if (e1 || e2) toast({ title: "Re-sync failed", description: (e1 || e2)?.message, variant: "destructive" });
    else { toast({ title: "Full re-sync queued", description: "Account will sync in 5-day chunks" }); setTimeout(fetchQueueData, 2000); }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ListChecks className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Sync Queue</CardTitle>
              <CardDescription>Adaptive chunked sync — scales to 10,000+ rows per account</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchQueueData} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Pending</p>
            <p className="text-2xl font-bold mt-1">{stats.pending}</p>
            {stats.pending > 0 && <p className="text-[10px] text-muted-foreground mt-0.5">~{Math.ceil(stats.pending / 4)} min to drain</p>}
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Processing</p>
            <p className="text-2xl font-bold mt-1 text-primary">{stats.processing}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">in flight</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Done (24h)</p>
            <p className="text-2xl font-bold mt-1 text-emerald-500">{stats.done_24h}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">avg {(stats.avg_ms / 1000).toFixed(1)}s/chunk</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Failed (24h)</p>
            <p className="text-2xl font-bold mt-1 text-destructive">{stats.failed_24h}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{stats.failed_24h === 0 ? "all healthy" : "needs attention"}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleDrainNow} disabled={!!actionLoading || stats.pending === 0}>
            {actionLoading === "drain" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RotateCw className="h-3.5 w-3.5 mr-1.5" />}
            Drain Now
          </Button>
          {failedJobs.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={handleRetryAll} disabled={!!actionLoading}>
                {actionLoading === "retry-all" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RotateCw className="h-3.5 w-3.5 mr-1.5" />}
                Retry All Failed
              </Button>
              <Button variant="outline" size="sm" onClick={handleClearFailed} disabled={!!actionLoading} className="text-destructive hover:text-destructive">
                {actionLoading === "clear-failed" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                Clear Failed
              </Button>
            </>
          )}
        </div>

        {/* Per-account chunk progress */}
        {accountProgress.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-primary" /> Account Sync Progress ({accountProgress.length})
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {accountProgress.map(p => {
                const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                const inProgress = p.pending + p.processing > 0;
                return (
                  <div key={p.ad_account_id} className="rounded-lg border p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-xs truncate">{p.account_name}</span>
                        {p.has_alert && (
                          <Badge variant="destructive" className="text-[9px] h-4 px-1 gap-0.5">
                            <ShieldAlert className="h-2.5 w-2.5" /> alert
                          </Badge>
                        )}
                        {inProgress ? (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5 text-primary border-primary/30">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" /> syncing
                          </Badge>
                        ) : p.failed === 0 ? (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5 text-emerald-600 border-emerald-300">
                            <CheckCircle2 className="h-2.5 w-2.5" /> verified
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[9px] h-4 px-1">{p.failed} failed</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {p.done}/{p.total} {p.recommended_chunk_days ? `· ${p.recommended_chunk_days}d` : ""}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px]"
                          disabled={actionLoading === `force-${p.ad_account_id}`}
                          onClick={() => handleForceReSync(p.ad_account_id)}
                          title="Force full re-sync (resets stats, re-chunks 25 days)"
                        >
                          {actionLoading === `force-${p.ad_account_id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    {p.avg_rows_per_day != null && p.avg_rows_per_day > 0 && (
                      <p className="text-[9px] text-muted-foreground">
                        ~{Math.round(p.avg_rows_per_day)} rows/day · {p.last_full_sync_at ? `last full ${formatDistanceToNow(new Date(p.last_full_sync_at), { addSuffix: true })}` : "no full sync yet"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Failed jobs list */}
        {failedJobs.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-destructive" /> Failed Jobs ({failedJobs.length})
            </p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {failedJobs.map(job => (
                <div key={job.id} className="flex items-start justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-xs truncate">{job.account_name}</span>
                      <Badge variant="outline" className="text-[9px] h-4 px-1">{job.function_name.replace("sync-", "")}</Badge>
                      {job.error_code && <Badge variant="destructive" className="text-[9px] h-4 px-1">{job.error_code}</Badge>}
                      {job.date_from && job.date_to && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">
                          {job.date_from}→{job.date_to}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">attempt {job.attempts}</span>
                    </div>
                    {job.last_error && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{job.last_error}</p>}
                    {job.completed_at && <p className="text-[9px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(job.completed_at), { addSuffix: true })}</p>}
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0" disabled={actionLoading === job.id} onClick={() => handleRetryOne(job.id)}>
                    {actionLoading === job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && stats.pending === 0 && stats.processing === 0 && failedJobs.length === 0 && accountProgress.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Queue idle — all accounts verified
          </div>
        )}
      </CardContent>
    </Card>
  );
}
