import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SyncPulseCard } from "./sync/SyncPulseCard";
import { SyncAccountsRail, AccountProgress } from "./sync/SyncAccountsRail";
import { SyncControlsAccordion } from "./sync/SyncControlsAccordion";
import { FailedJob } from "./sync/SyncErrorPanel";

interface QueueStats {
  pending: number;
  processing: number;
  failed_24h: number;
  done_24h: number;
  avg_ms: number;
}

export function SyncTab() {
  const [stats, setStats] = useState<QueueStats>({ pending: 0, processing: 0, failed_24h: 0, done_24h: 0, avg_ms: 0 });
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [accountProgress, setAccountProgress] = useState<AccountProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
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

      const activeJobs = (activeJobsRes.data ?? []) as any[];
      const statsRows = (statsRes.data ?? []) as any[];
      const alertSet = new Set(((alertsRes.data ?? []) as any[]).map(a => a.ad_account_id));
      const statsMap = new Map(statsRows.map(s => [s.ad_account_id, s]));

      const progMap = new Map<string, AccountProgress>();
      for (const j of activeJobs) {
        if (!j.parent_job_id) continue;
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
      progArr.sort((a, b) => {
        const aActive = a.pending + a.processing;
        const bActive = b.pending + b.processing;
        if (aActive !== bActive) return bActive - aActive;
        return b.failed - a.failed;
      });
      setAccountProgress(progArr.slice(0, 12));
    } catch (err) {
      console.error("Failed to load sync data:", err);
    }
    setLoading(false);
    setInitialLoading(false);
  }, []);

  // Debounced refresh for realtime events
  const debouncedRefresh = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchData(), 1000);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);

    // Realtime subscription on sync_jobs
    const channel = supabase
      .channel("sync-jobs-pulse")
      .on("postgres_changes", { event: "*", schema: "public", table: "sync_jobs" }, () => debouncedRefresh())
      .subscribe();

    return () => {
      clearInterval(interval);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      supabase.removeChannel(channel);
    };
  }, [fetchData, debouncedRefresh]);

  return (
    <div className="space-y-5">
      <SyncPulseCard
        stats={stats}
        loading={loading}
        initialLoading={initialLoading}
        onRefresh={fetchData}
        failedCount={failedJobs.length}
      />
      <SyncAccountsRail
        accounts={accountProgress}
        initialLoading={initialLoading}
        onRefresh={fetchData}
      />
      <SyncControlsAccordion
        failedJobs={failedJobs}
        onRefresh={fetchData}
      />
    </div>
  );
}
