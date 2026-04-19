// Pure helpers for computing per-account, per-lane sync health.

export type HealthTier = "excellent" | "healthy" | "degraded" | "critical" | "idle";
export type ActivityTier = "live" | "quiet" | "silent" | "dormant" | "unknown";

export interface LaneJobStats {
  done: number;
  failed: number;
  pending: number;
  processing: number;
  last_done_at: string | null;
  last_error: string | null;
  last_error_code: string | null;
  consecutive_failures: number;
}

export interface LaneHealth {
  tier: HealthTier;
  score: number; // 0-100
  total: number;
  done: number;
  failed: number;
  pending: number;
  processing: number;
  last_done_at: string | null;
  last_error: string | null;
  last_error_code: string | null;
  is_syncing: boolean;
}

export interface ActivitySignal {
  tier: ActivityTier;
  last_fast_lane_at: string | null;
  last_fast_lane_rows: number;
  consecutive_zero_runs: number;
  deep_dive_will_run: boolean;
  hours_since_last_run: number | null;
  hours_until_heartbeat: number | null;
}

export const TIER_META: Record<HealthTier, { label: string; tone: string; dot: string; ring: string }> = {
  excellent: { label: "Excellent", tone: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", ring: "ring-emerald-500/30" },
  healthy:   { label: "Healthy",   tone: "text-green-600 dark:text-green-400",     dot: "bg-green-500",   ring: "ring-green-500/30" },
  degraded:  { label: "Degraded",  tone: "text-amber-600 dark:text-amber-400",     dot: "bg-amber-500",   ring: "ring-amber-500/30" },
  critical:  { label: "Critical",  tone: "text-destructive",                       dot: "bg-destructive", ring: "ring-destructive/30" },
  idle:      { label: "Idle",      tone: "text-muted-foreground",                  dot: "bg-muted-foreground/50", ring: "ring-muted/30" },
};

export const ACTIVITY_META: Record<ActivityTier, { label: string; tone: string; dot: string; description: string }> = {
  live:    { label: "Live",    tone: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500",          description: "Fast-Lane returned data — Deep-Dive scheduled" },
  quiet:   { label: "Quiet",   tone: "text-sky-600 dark:text-sky-400",         dot: "bg-sky-500",              description: "Briefly silent — Deep-Dive still scheduled (grace period)" },
  silent:  { label: "Silent",  tone: "text-amber-600 dark:text-amber-400",     dot: "bg-amber-500",            description: "No data in recent runs — Deep-Dive skipped to save quota" },
  dormant: { label: "Dormant", tone: "text-muted-foreground",                  dot: "bg-muted-foreground/60",  description: "No data for 24h+ — only heartbeat Deep-Dive runs" },
  unknown: { label: "New",     tone: "text-primary",                            dot: "bg-primary",              description: "Not yet measured — Deep-Dive runs normally" },
};

export const ZERO_RUN_GRACE = 3; // <3 zero runs = grace period, deep-dive still runs
export const HEARTBEAT_HOURS = 6; // matches sync-orchestrator HEARTBEAT_HOURS

/** Compact "ago" string (no "about", no "minutes"): now / 5m / 3h / 2d */
export function formatAgoCompact(date: string | Date | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

export function computeLaneHealth(stats: LaneJobStats, opts?: { tokenExpired?: boolean }): LaneHealth {
  const total = stats.done + stats.failed + stats.pending + stats.processing;
  const isSyncing = stats.pending + stats.processing > 0;

  if (total === 0 && !opts?.tokenExpired) {
    return {
      tier: "idle", score: 0, total: 0, done: 0, failed: 0, pending: 0, processing: 0,
      last_done_at: stats.last_done_at, last_error: stats.last_error, last_error_code: stats.last_error_code,
      is_syncing: false,
    };
  }

  const completed = stats.done + stats.failed;
  const baseScore = completed > 0 ? (stats.done / completed) * 100 : (isSyncing ? 80 : 0);
  const failurePenalty = stats.consecutive_failures * 10;

  const hoursSinceSync = stats.last_done_at
    ? (Date.now() - new Date(stats.last_done_at).getTime()) / 3600_000
    : 999;
  const stalePenalty = hoursSinceSync > 2 ? 20 : 0;

  let score = Math.max(0, Math.min(100, Math.round(baseScore - failurePenalty - stalePenalty)));

  let tier: HealthTier;
  if (opts?.tokenExpired || stats.consecutive_failures >= 3 || hoursSinceSync > 24) {
    tier = "critical";
    score = Math.min(score, 35);
  } else if (score >= 95 && stats.failed === 0 && hoursSinceSync < 0.5) {
    tier = "excellent";
  } else if (score >= 75 && stats.failed < 2 && hoursSinceSync < 2) {
    tier = "healthy";
  } else if (score >= 40) {
    tier = "degraded";
  } else {
    tier = "critical";
  }

  return {
    tier, score, total,
    done: stats.done, failed: stats.failed, pending: stats.pending, processing: stats.processing,
    last_done_at: stats.last_done_at, last_error: stats.last_error, last_error_code: stats.last_error_code,
    is_syncing: isSyncing,
  };
}

/**
 * Compute Fast-Lane activity signal — drives whether Deep-Dive will be scheduled.
 * Rule: Deep-Dive runs only for accounts where Fast-Lane returned data recently.
 */
export function computeActivitySignal(input: {
  last_fast_lane_at: string | null;
  last_fast_lane_rows: number;
  consecutive_zero_runs: number;
}): ActivitySignal {
  const { last_fast_lane_at, last_fast_lane_rows, consecutive_zero_runs } = input;

  // Never had a fast-lane run yet
  if (!last_fast_lane_at) {
    return {
      tier: "unknown",
      last_fast_lane_at: null,
      last_fast_lane_rows: 0,
      consecutive_zero_runs: 0,
      deep_dive_will_run: true, // first-timers get deep-dive to gather baseline
      hours_since_last_run: null,
      hours_until_heartbeat: null,
    };
  }

  const hoursSince = (Date.now() - new Date(last_fast_lane_at).getTime()) / 3600_000;

  // Just got data → Live
  if (last_fast_lane_rows > 0) {
    return {
      tier: "live",
      last_fast_lane_at,
      last_fast_lane_rows,
      consecutive_zero_runs: 0,
      deep_dive_will_run: true,
      hours_since_last_run: hoursSince,
      hours_until_heartbeat: null,
    };
  }

  // Zero rows but within grace period
  if (consecutive_zero_runs < ZERO_RUN_GRACE) {
    return {
      tier: "quiet",
      last_fast_lane_at,
      last_fast_lane_rows: 0,
      consecutive_zero_runs,
      deep_dive_will_run: true,
      hours_since_last_run: hoursSince,
      hours_until_heartbeat: null,
    };
  }

  // Past grace period: silent or dormant
  const hoursUntilHeartbeat = Math.max(0, HEARTBEAT_HOURS - hoursSince);
  if (hoursSince >= HEARTBEAT_HOURS) {
    return {
      tier: "dormant",
      last_fast_lane_at,
      last_fast_lane_rows: 0,
      consecutive_zero_runs,
      deep_dive_will_run: true, // 24h heartbeat fires
      hours_since_last_run: hoursSince,
      hours_until_heartbeat: 0,
    };
  }

  return {
    tier: "silent",
    last_fast_lane_at,
    last_fast_lane_rows: 0,
    consecutive_zero_runs,
    deep_dive_will_run: false, // SKIPPED — saves quota
    hours_since_last_run: hoursSince,
    hours_until_heartbeat: hoursUntilHeartbeat,
  };
}

export function summarizeIssue(fast: LaneHealth, deep: LaneHealth, tokenExpiringInDays: number | null): string | null {
  if (tokenExpiringInDays !== null && tokenExpiringInDays <= 0) return "Token expired — refresh now";
  if (tokenExpiringInDays !== null && tokenExpiringInDays <= 7) return `Token expires in ${tokenExpiringInDays}d`;
  const worst = [fast, deep].filter(l => l.tier === "critical" || l.tier === "degraded")
    .sort((a, b) => a.score - b.score)[0];
  if (!worst) return null;
  if (worst.last_error_code) {
    const code = worst.last_error_code;
    if (code.includes("41000")) return "Geo restricted (41000)";
    if (code.toLowerCase().includes("token")) return "Token error";
    if (code.toLowerCase().includes("rate")) return "Rate limited";
    return `Error ${code}`;
  }
  if (worst.failed > 0) return `${worst.failed} chunk${worst.failed > 1 ? "s" : ""} failed`;
  if (worst.last_error) return worst.last_error.slice(0, 48);
  return null;
}
