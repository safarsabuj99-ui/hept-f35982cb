import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOTAL_WINDOW_DAYS = 25;
const PARALLEL_WORKER_TRIGGERS = 6;


/** Format date as YYYY-MM-DD (UTC) */
function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Build chunk windows for the last `totalDays` ending today, each `chunkDays` long. */
function buildChunks(totalDays: number, chunkDays: number): Array<{ from: string; to: string }> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (totalDays - 1));

  const chunks: Array<{ from: string; to: string }> = [];
  let cursor = new Date(start);
  while (cursor <= today) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + chunkDays - 1);
    if (chunkEnd > today) chunkEnd.setTime(today.getTime());
    // ±1 day overlap buffer for late attribution
    const fromBuf = new Date(cursor); fromBuf.setUTCDate(fromBuf.getUTCDate() - 1);
    const toBuf = new Date(chunkEnd); toBuf.setUTCDate(toBuf.getUTCDate() + 1);
    if (toBuf > today) toBuf.setTime(today.getTime());
    chunks.push({ from: fmt(fromBuf < start ? cursor : fromBuf), to: fmt(toBuf) });
    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let body: any = {};
    try { body = await req.json(); } catch {}

    const targetFunction: string = body?.function || "sync-fast-lane";
    const validFunctions = ["sync-fast-lane", "sync-deep-dive"];
    if (!validFunctions.includes(targetFunction)) {
      return new Response(
        JSON.stringify({ error: `Invalid function: ${targetFunction}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Orchestrator enqueueing for: ${targetFunction}`);

    // Get all mapped ad accounts
    const { data: mappedAssignments } = await supabase
      .from("ad_account_clients")
      .select("ad_account_id")
      .neq("mapping_keyword", "");

    if (!mappedAssignments || mappedAssignments.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No mapped accounts", enqueued: 0, queue_depth: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mappedAccountIds = [...new Set(mappedAssignments.map(r => r.ad_account_id))];

    // Get active accounts
    const { data: accounts } = await supabase
      .from("ad_accounts")
      .select("id, account_name, ad_account_id, platform_name, api_integration_id, org_id")
      .eq("is_active", true)
      .in("id", mappedAccountIds);

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No active mapped accounts", enqueued: 0, queue_depth: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load per-account stats for adaptive chunking + activity gating
    const { data: stats } = await supabase
      .from("sync_account_stats")
      .select("ad_account_id, recommended_chunk_days, consecutive_failures, total_rows_last_sync, last_fast_lane_at, last_fast_lane_rows, consecutive_zero_runs, last_full_sync_at")
      .in("ad_account_id", accounts.map(a => a.id));
    const statsMap = new Map((stats ?? []).map((s: any) => [s.ad_account_id, s]));

    // Find existing pending/processing jobs per account so we don't duplicate
    const { data: existingJobs } = await supabase
      .from("sync_jobs")
      .select("ad_account_id, date_from, date_to, parent_job_id")
      .eq("function_name", targetFunction)
      .in("status", ["pending", "processing"]);

    const existingByAccount = new Map<string, Set<string>>();
    for (const j of existingJobs ?? []) {
      const key = j.ad_account_id;
      if (!existingByAccount.has(key)) existingByAccount.set(key, new Set());
      const w = `${j.date_from || ''}_${j.date_to || ''}`;
      existingByAccount.get(key)!.add(w);
    }

    let totalEnqueued = 0;
    let chunkedAccounts = 0;
    let fullAccounts = 0;
    let skippedSilent = 0;
    let heartbeatRuns = 0;

    // For sync-fast-lane (today-only), we still single-shot since it's a 1-day window
    const isFastLane = targetFunction === "sync-fast-lane";
    const isDeepDive = targetFunction === "sync-deep-dive";
    const ZERO_RUN_GRACE = 3;
    const HEARTBEAT_HOURS = 6;
    const nowMs = Date.now();

    for (const acc of accounts) {
      const stat = statsMap.get(acc.id) as any;

      // ===== ACTIVITY GATING for Deep-Dive =====
      // Rule: skip Deep-Dive when Fast-Lane has shown no data for >= ZERO_RUN_GRACE consecutive runs.
      // Heartbeat: still run once every 24h to catch reactivations.
      if (isDeepDive && stat?.last_fast_lane_at) {
        const zeroRuns = stat.consecutive_zero_runs ?? 0;
        const lastRows = stat.last_fast_lane_rows ?? 0;
        if (lastRows === 0 && zeroRuns >= ZERO_RUN_GRACE) {
          const lastFullSyncMs = stat.last_full_sync_at ? new Date(stat.last_full_sync_at).getTime() : 0;
          const hoursSinceFullSync = lastFullSyncMs > 0 ? (nowMs - lastFullSyncMs) / 3600_000 : 999;
          if (hoursSinceFullSync < HEARTBEAT_HOURS) {
            skippedSilent++;
            console.log(`Skipping Deep-Dive for ${acc.account_name} (${zeroRuns} zero-runs, last sync ${hoursSinceFullSync.toFixed(1)}h ago)`);
            continue;
          } else {
            heartbeatRuns++;
            console.log(`Heartbeat Deep-Dive for ${acc.account_name} (silent ${zeroRuns} runs, last full sync ${hoursSinceFullSync.toFixed(1)}h ago)`);
          }
        }
      }

      // Fast-lane: always 1-day full job
      const chunkDays = isFastLane ? 25 : (stat?.recommended_chunk_days ?? 5);
      const useChunking = !isFastLane && (
        chunkDays < TOTAL_WINDOW_DAYS ||
        (stat?.consecutive_failures ?? 0) >= 1 ||
        (stat?.total_rows_last_sync ?? 0) >= 200 ||
        !stat
      );

      if (!useChunking) {
        // Single full-window job (light account or fast-lane)
        const w = `_`; // no chunk dates → single key
        if (existingByAccount.get(acc.id)?.has(w)) continue;

        const { error } = await supabase.from("sync_jobs").insert({
          ad_account_id: acc.id,
          function_name: targetFunction,
          status: "pending",
          org_id: acc.org_id,
          chunk_strategy: "full",
        });
        if (!error) { totalEnqueued++; fullAccounts++; }
      } else {
        // Build chunks
        const chunks = buildChunks(TOTAL_WINDOW_DAYS, chunkDays);
        const parentId = crypto.randomUUID();
        const rows = chunks.map((c, idx) => ({
          ad_account_id: acc.id,
          function_name: targetFunction,
          status: "pending",
          org_id: acc.org_id,
          parent_job_id: parentId,
          chunk_index: idx,
          chunk_total: chunks.length,
          date_from: c.from,
          date_to: c.to,
          chunk_strategy: "chunked",
        }));

        // Filter out already-queued chunks (same date window)
        const fresh = rows.filter(r => !existingByAccount.get(acc.id)?.has(`${r.date_from}_${r.date_to}`));
        if (fresh.length === 0) continue;

        const { data: inserted } = await supabase.from("sync_jobs").insert(fresh).select("id");
        const cnt = inserted?.length ?? 0;
        if (cnt > 0) { totalEnqueued += cnt; chunkedAccounts++; }
      }
    }

    // Token health check (kept from original)
    const integrationIds = [...new Set(accounts.map(a => a.api_integration_id).filter(Boolean))];
    if (integrationIds.length > 0) {
      const { data: integrations } = await supabase
        .from("api_integrations")
        .select("id, token_expiry_date, platform")
        .in("id", integrationIds);

      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      for (const integration of integrations ?? []) {
        if (integration.token_expiry_date) {
          const expiryDate = new Date(integration.token_expiry_date);
          if (expiryDate <= sevenDaysFromNow) {
            const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
            const affectedAccounts = accounts.filter(a => a.api_integration_id === integration.id);
            for (const acc of affectedAccounts) {
              const { data: existingAlert } = await supabase
                .from("billing_notifications")
                .select("id")
                .eq("ad_account_id", acc.id)
                .eq("alert_type", "token_expiry_warning")
                .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
                .limit(1);

              if (!existingAlert?.length) {
                const { data: clientLink } = await supabase
                  .from("ad_account_clients")
                  .select("client_id")
                  .eq("ad_account_id", acc.id)
                  .limit(1)
                  .single();

                if (clientLink) {
                  await supabase.from("billing_notifications").insert({
                    ad_account_id: acc.id,
                    client_id: clientLink.client_id,
                    alert_type: "token_expiry_warning",
                    priority: daysLeft <= 2 ? "critical" : "high",
                    message: `${integration.platform} API token for ${acc.account_name} expires in ${daysLeft} day(s). Renew immediately to prevent data loss.`,
                  });
                }
              }
            }
          }
        }
      }
    }

    // Get current queue depth
    const { count: queueDepth } = await supabase
      .from("sync_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    // Fire-and-forget trigger MULTIPLE workers for parallelism
    for (let i = 0; i < PARALLEL_WORKER_TRIGGERS; i++) {
      fetch(`${supabaseUrl}/functions/v1/sync-queue-worker`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({}),
      }).catch(err => console.error(`Worker ${i} trigger failed:`, err));
    }

    // Cleanup old sync_logs (>30 days) and old done/failed jobs (>7 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("sync_logs").delete().lt("created_at", thirtyDaysAgo);
    await supabase.from("sync_jobs").delete().in("status", ["done", "failed"]).lt("completed_at", sevenDaysAgo);

    console.log(`Orchestrator: ${totalEnqueued} jobs (chunked: ${chunkedAccounts}, full: ${fullAccounts}, skipped silent: ${skippedSilent}, heartbeat: ${heartbeatRuns}), queue depth: ${queueDepth ?? 0}`);

    return new Response(
      JSON.stringify({
        ok: true,
        function: targetFunction,
        accounts_total: accounts.length,
        chunked_accounts: chunkedAccounts,
        full_accounts: fullAccounts,
        skipped_silent: skippedSilent,
        heartbeat_runs: heartbeatRuns,
        enqueued: totalEnqueued,
        queue_depth: queueDepth ?? 0,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("sync-orchestrator error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
