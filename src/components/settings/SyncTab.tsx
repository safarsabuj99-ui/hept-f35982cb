import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SyncPulseCard } from "./sync/SyncPulseCard";
import { SyncAccountsRail, AccountProgress } from "./sync/SyncAccountsRail";
import { SyncControlsAccordion } from "./sync/SyncControlsAccordion";
import { FailedJob } from "./sync/SyncErrorPanel";
import { SyncHealthMatrix } from "./sync/SyncHealthMatrix";
import { AccountHealth, BacklogEntry } from "./sync/SyncHealthRow";
import { computeLaneHealth, summarizeIssue, computeActivitySignal, LaneJobStats } from "./sync/healthScore";

interface QueueStats {
  pending: number;
  processing: number;
  failed_24h: number;
  done_24h: number;
  avg_ms: number;
  chunks_in_flight: number;
  backlog_total: number;
  auto_shrunk_24h: number;
}

const FAST_LANE_FNS = new Set(["sync-fast-lane"]);
const DEEP_DIVE_FNS = new Set(["sync-deep-dive"]);

function blankStats(): LaneJobStats {
  return { done: 0, failed: 0, pending: 0, processing: 0, last_done_at: null, last_error: null, last_error_code: null, consecutive_failures: 0 };
}

export function SyncTab() {
  const [stats, setStats] = useState<QueueStats>({ pending: 0, processing: 0, failed_24h: 0, done_24h: 0, avg_ms: 0, chunks_in_flight: 0, backlog_total: 0, auto_shrunk_24h: 0 });
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [accountProgress, setAccountProgress] = useState<AccountProgress[]>([]);
  const [accountHealth, setAccountHealth] = useState<AccountHealth[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [pendingRes, processingRes, failedRes, doneRes, jobsRes, activeJobsRes, statsRes, alertsRes, allJobs24hRes, integrationsRes, accountsRes, backlogRes] = await Promise.all([
        supabase.from("sync_jobs" as any).select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("sync_jobs" as any).select("id", { count: "exact", head: true }).eq("status", "processing"),
        supabase.from("sync_jobs" as any).select("id", { count: "exact", head: true }).eq("status", "failed").gte("completed_at", since24h),
        supabase.from("sync_jobs" as any).select("id, started_at, completed_at", { count: "exact" }).eq("status", "done").gte("completed_at", since24h).limit(100),
        supabase.from("sync_jobs" as any).select("id, ad_account_id, function_name, attempts, last_error, error_code, completed_at, date_from, date_to, chunk_index, chunk_total").eq("status", "failed").order("completed_at", { ascending: false }).limit(20),
        supabase.from("sync_jobs" as any).select("ad_account_id, status, parent_job_id").in("status", ["pending", "processing", "done", "failed"]).gte("scheduled_at", since24h),
        supabase.from("sync_account_stats" as any).select("ad_account_id, avg_rows_per_day, recommended_chunk_days, last_full_sync_at, consecutive_failures, last_error, last_fast_lane_at, last_fast_lane_rows, consecutive_zero_runs"),
        supabase.from("sync_integrity_alerts" as any).select("ad_account_id").eq("resolved", false),
        supabase.from("sync_jobs" as any).select("ad_account_id, function_name, status, completed_at, last_error, error_code, date_from, date_to, parent_job_id").gte("scheduled_at", since24h),
        supabase.from("api_integrations").select("id, platform, token_expiry_date, connection_status"),
        supabase.from("ad_accounts").select("id, account_name, platform_name, api_integration_id, is_active"),
        supabase.from("deep_dive_backlog" as any).select("ad_account_id, data_date, attempts, next_retry_at, last_error").order("next_retry_at", { ascending: true }),
      ]);

      const doneRows = (doneRes.data ?? []) as any[];
      let avgMs = 0;
      if (doneRows.length > 0) {
        const durations = doneRows.filter(r => r.started_at && r.completed_at)
          .map(r => new Date(r.completed_at).getTime() - new Date(r.started_at).getTime());
        avgMs = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
      }

      // Backlog aggregation
      const backlogRows = (backlogRes.data ?? []) as any[];
      const backlogByAccount = new Map<string, BacklogEntry[]>();
      for (const b of backlogRows) {
        if (!backlogByAccount.has(b.ad_account_id)) backlogByAccount.set(b.ad_account_id, []);
        backlogByAccount.get(b.ad_account_id)!.push({
          data_date: b.data_date, attempts: b.attempts, next_retry_at: b.next_retry_at, last_error: b.last_error,
        });
      }

      // Auto-shrunk + chunks-in-flight + splits per account from all jobs 24h
      const allJobsRaw = (allJobs24hRes.data ?? []) as any[];
      const splitsByAccount = new Map<string, number>();
      let chunksInFlight = 0;
      let autoShrunk24h = 0;
      for (const j of allJobsRaw) {
        if (j.parent_job_id && (j.status === "pending" || j.status === "processing")) chunksInFlight++;
        // a 1-day chunk child = parent_job_id set AND date_from == date_to
        if (j.parent_job_id && j.date_from && j.date_to && j.function_name?.includes("deep-dive")) {
          const oneDay = j.date_from === j.date_to;
          if (oneDay) {
            splitsByAccount.set(j.ad_account_id, (splitsByAccount.get(j.ad_account_id) ?? 0) + 1);
            if (j.status === "done") autoShrunk24h++;
          }
        }
      }

      setStats({
        pending: pendingRes.count ?? 0,
        processing: processingRes.count ?? 0,
        failed_24h: failedRes.count ?? 0,
        done_24h: doneRes.count ?? 0,
        avg_ms: avgMs,
        chunks_in_flight: chunksInFlight,
        backlog_total: backlogRows.length,
        auto_shrunk_24h: autoShrunk24h,
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
            ad_account_id: acc, account_name: acc,
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

      const accounts = (accountsRes.data ?? []) as any[];
      const integrations = (integrationsRes.data ?? []) as any[];
      const integrationMap = new Map(integrations.map(i => [i.id, i]));
      const nameMap = new Map(accounts.map(a => [a.id, a.account_name]));

      // Build per-account, per-lane health
      const allJobs = (allJobs24hRes.data ?? []) as any[];
      const laneMap = new Map<string, { fast: LaneJobStats; deep: LaneJobStats }>();
      for (const j of allJobs) {
        if (!j.ad_account_id) continue;
        if (!laneMap.has(j.ad_account_id)) laneMap.set(j.ad_account_id, { fast: blankStats(), deep: blankStats() });
        const entry = laneMap.get(j.ad_account_id)!;
        const lane = FAST_LANE_FNS.has(j.function_name) ? entry.fast : DEEP_DIVE_FNS.has(j.function_name) ? entry.deep : null;
        if (!lane) continue;
        if (j.status === "done") lane.done++;
        else if (j.status === "failed") { lane.failed++; lane.last_error = j.last_error ?? lane.last_error; lane.last_error_code = j.error_code ?? lane.last_error_code; }
        else if (j.status === "pending") lane.pending++;
        else if (j.status === "processing") lane.processing++;
        if (j.status === "done" && j.completed_at) {
          if (!lane.last_done_at || new Date(j.completed_at) > new Date(lane.last_done_at)) lane.last_done_at = j.completed_at;
        }
      }

      const healthList: AccountHealth[] = accounts
        .filter(a => a.is_active)
        .map(a => {
          const lanes = laneMap.get(a.id) ?? { fast: blankStats(), deep: blankStats() };
          const st = statsMap.get(a.id) as any;
          if (st?.consecutive_failures) {
            lanes.fast.consecutive_failures = st.consecutive_failures;
            lanes.deep.consecutive_failures = st.consecutive_failures;
          }
          const integration = a.api_integration_id ? integrationMap.get(a.api_integration_id) as any : null;
          let tokenExpiringInDays: number | null = null;
          if (integration?.token_expiry_date) {
            const days = Math.ceil((new Date(integration.token_expiry_date).getTime() - Date.now()) / 86400_000);
            tokenExpiringInDays = days;
          }
          const tokenExpired = tokenExpiringInDays !== null && tokenExpiringInDays <= 0;
          const fast = computeLaneHealth(lanes.fast, { tokenExpired });
          const deep = computeLaneHealth(lanes.deep, { tokenExpired });
          const activity = computeActivitySignal({
            last_fast_lane_at: st?.last_fast_lane_at ?? null,
            last_fast_lane_rows: st?.last_fast_lane_rows ?? 0,
            consecutive_zero_runs: st?.consecutive_zero_runs ?? 0,
          });
          const backlog = backlogByAccount.get(a.id) ?? [];
          const splits = splitsByAccount.get(a.id) ?? 0;
          const selfHealed = splits > 0 && (deep.tier === "healthy" || deep.tier === "excellent");
          return {
            ad_account_id: a.id,
            account_name: a.account_name || a.id,
            platform: a.platform_name ?? null,
            fast, deep, activity,
            issue: summarizeIssue(fast, deep, tokenExpiringInDays),
            token_expiring_in_days: tokenExpiringInDays,
            backlog_count: backlog.length,
            backlog_next_retry_at: backlog[0]?.next_retry_at ?? null,
            backlog_entries: backlog.slice(0, 5),
            current_chunk_days: st?.recommended_chunk_days ?? null,
            splits_24h: splits,
            self_healed: selfHealed,
          };
        });
      setAccountHealth(healthList);

      const failed = (jobsRes.data ?? []) as unknown as FailedJob[];
      setFailedJobs(failed.map(j => ({ ...j, account_name: nameMap.get(j.ad_account_id) ?? j.ad_account_id })));

      const progArr = Array.from(progMap.values()).map(p => ({
        ...p, account_name: nameMap.get(p.ad_account_id) ?? p.ad_account_id,
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

  const debouncedRefresh = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchData(), 1000);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
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
      <SyncHealthMatrix
        accounts={accountHealth}
        initialLoading={initialLoading}
        loading={loading}
        onRefresh={fetchData}
      />
      <SyncControlsAccordion
        failedJobs={failedJobs}
        onRefresh={fetchData}
      />
    </div>
  );
}
