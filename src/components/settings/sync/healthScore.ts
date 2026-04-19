// Pure helpers for computing per-account, per-lane sync health.

export type HealthTier = "excellent" | "healthy" | "degraded" | "critical" | "idle";

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

export const TIER_META: Record<HealthTier, { label: string; tone: string; dot: string; ring: string }> = {
  excellent: { label: "Excellent", tone: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", ring: "ring-emerald-500/30" },
  healthy:   { label: "Healthy",   tone: "text-green-600 dark:text-green-400",     dot: "bg-green-500",   ring: "ring-green-500/30" },
  degraded:  { label: "Degraded",  tone: "text-amber-600 dark:text-amber-400",     dot: "bg-amber-500",   ring: "ring-amber-500/30" },
  critical:  { label: "Critical",  tone: "text-destructive",                       dot: "bg-destructive", ring: "ring-destructive/30" },
  idle:      { label: "Idle",      tone: "text-muted-foreground",                  dot: "bg-muted-foreground/50", ring: "ring-muted/30" },
};

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
