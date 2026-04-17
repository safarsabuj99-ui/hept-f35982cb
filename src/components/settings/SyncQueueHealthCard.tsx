import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, ListChecks, Trash2, RotateCw, AlertCircle, CheckCircle2 } from "lucide-react";

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
  account_name?: string;
}

export function SyncQueueHealthCard() {
  const { toast } = useToast();
  const [stats, setStats] = useState<QueueStats>({ pending: 0, processing: 0, failed_24h: 0, done_24h: 0, avg_ms: 0 });
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchQueueData = async () => {
    setLoading(true);
    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [pendingRes, processingRes, failedRes, doneRes, jobsRes] = await Promise.all([
        supabase.from("sync_jobs" as any).select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("sync_jobs" as any).select("id", { count: "exact", head: true }).eq("status", "processing"),
        supabase.from("sync_jobs" as any).select("id", { count: "exact", head: true }).eq("status", "failed").gte("completed_at", since24h),
        supabase.from("sync_jobs" as any).select("id, started_at, completed_at", { count: "exact" }).eq("status", "done").gte("completed_at", since24h).limit(100),
        supabase.from("sync_jobs" as any).select("id, ad_account_id, function_name, attempts, last_error, error_code, completed_at").eq("status", "failed").order("completed_at", { ascending: false }).limit(20),
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

      // Enrich failed jobs with account name
      const failed = (jobsRes.data ?? []) as FailedJob[];
      const accountIds = [...new Set(failed.map(j => j.ad_account_id))];
      if (accountIds.length > 0) {
        const { data: accounts } = await supabase.from("ad_accounts").select("id, account_name").in("id", accountIds);
        const nameMap = new Map((accounts ?? []).map(a => [a.id, a.account_name]));
        setFailedJobs(failed.map(j => ({ ...j, account_name: nameMap.get(j.ad_account_id) ?? j.ad_account_id })));
      } else {
        setFailedJobs([]);
      }
    } catch (err) {
      console.error("Failed to load queue data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchQueueData();
    const interval = setInterval(fetchQueueData, 15000); // auto-refresh every 15s
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
    else { toast({ title: "Worker triggered", description: "Processing 10 jobs" }); setTimeout(fetchQueueData, 2000); }
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
              <CardDescription>Job queue powering large-scale sync (1000+ campaigns)</CardDescription>
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
            {stats.pending > 0 && <p className="text-[10px] text-muted-foreground mt-0.5">~{Math.ceil(stats.pending / 10)} min to drain</p>}
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Processing</p>
            <p className="text-2xl font-bold mt-1 text-blue-500">{stats.processing}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">in flight</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Done (24h)</p>
            <p className="text-2xl font-bold mt-1 text-green-500">{stats.done_24h}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">avg {(stats.avg_ms / 1000).toFixed(1)}s/job</p>
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

        {!loading && stats.pending === 0 && stats.processing === 0 && failedJobs.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Queue idle — all jobs processed
          </div>
        )}
      </CardContent>
    </Card>
  );
}
