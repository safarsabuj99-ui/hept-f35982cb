import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 1; // 1 job per worker — sync-deep-dive is heavy
const HARD_TIMEOUT_MS = 140000; // exit cleanly under 150s wall-clock limit
const PER_JOB_TIMEOUT_MS = 90000; // chunk-sized jobs finish well under this

function classifyError(errorMsg: string, errorCode?: string): string {
  if (!errorMsg) return "unknown";
  const msg = errorMsg.toLowerCase();
  if (errorCode === "token_expired" || msg.includes("error 190") || msg.includes("40001") || (msg.includes("token") && msg.includes("expir"))) return "token_expired";
  if (errorCode === "geo_blocked" || msg.includes("41000") || msg.includes("banned country")) return "geo_blocked";
  if (errorCode === "rate_limited" || msg.includes("429") || msg.includes("rate limit")) return "rate_limited";
  if (msg.includes("cpu time exceeded") || msg.includes("timeout") || msg.includes("aborted")) return "cpu_timeout";
  return errorCode || "api_error";
}

function isPermanentError(code: string): boolean {
  return code === "token_expired" || code === "geo_blocked";
}

/** Shrink a chunk window for retry: 7→5→3→1 */
function shrinkWindow(dateFrom: string, dateTo: string): Array<{ from: string; to: string }> | null {
  const from = new Date(dateFrom + "T00:00:00Z");
  const to = new Date(dateTo + "T00:00:00Z");
  const days = Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (days <= 1) return null; // can't shrink further

  const newSize = days <= 3 ? 1 : Math.ceil(days / 2);
  const out: Array<{ from: string; to: string }> = [];
  let cursor = new Date(from);
  while (cursor <= to) {
    const end = new Date(cursor);
    end.setUTCDate(end.getUTCDate() + newSize - 1);
    if (end > to) end.setTime(to.getTime());
    out.push({
      from: cursor.toISOString().split("T")[0],
      to: end.toISOString().split("T")[0],
    });
    cursor = new Date(end);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Atomically claim N pending jobs (also recovers stuck "processing" jobs)
    const { data: claimedJobs, error: claimError } = await supabase.rpc("claim_sync_jobs", { p_limit: BATCH_SIZE });

    if (claimError) {
      console.error("Failed to claim jobs:", claimError);
      return new Response(
        JSON.stringify({ ok: false, error: claimError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!claimedJobs || claimedJobs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, succeeded: 0, failed: 0, remaining: 0, message: "Queue empty" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Worker claimed ${claimedJobs.length} jobs`);

    let succeeded = 0;
    let failed = 0;

    for (const job of claimedJobs) {
      if (Date.now() - startTime > HARD_TIMEOUT_MS) {
        console.log(`Hard timeout reached, exiting`);
        break;
      }

      let jobError = "";
      let jobErrorCode = "";
      let rowsSynced = 0;
      let success = false;

      const isChunked = job.chunk_strategy === "chunked" && job.date_from && job.date_to;
      const chunkLabel = isChunked ? ` [${job.date_from}→${job.date_to} #${job.chunk_index! + 1}/${job.chunk_total}]` : "";

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), PER_JOB_TIMEOUT_MS);

        const requestBody: any = { ad_account_ids: [job.ad_account_id] };
        if (isChunked) {
          requestBody.date_from = job.date_from;
          requestBody.date_to = job.date_to;
        }

        const response = await fetch(`${supabaseUrl}/functions/v1/${job.function_name}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const data = await response.json();

        if (!response.ok || data.error) {
          jobError = data.error || `HTTP ${response.status}`;
          jobErrorCode = classifyError(jobError, data.error_code);
        } else {
          rowsSynced = data.synced || data.accounts_synced || data.records_upserted || 0;
          success = true;
        }
      } catch (err: any) {
        jobError = err.message || "Unknown error";
        jobErrorCode = classifyError(jobError);
      }

      // Update job status
      if (success) {
        await supabase.from("sync_jobs").update({
          status: "done",
          rows_synced: rowsSynced,
          completed_at: new Date().toISOString(),
          last_error: null,
          error_code: null,
        }).eq("id", job.id);

        await supabase.from("sync_logs").insert({
          ad_account_id: job.ad_account_id,
          function_name: job.function_name,
          status: "success",
          rows_synced: rowsSynced,
          retry_count: job.attempts - 1,
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
        });
        succeeded++;
        console.log(`✅ Job ${job.id}${chunkLabel}: ${rowsSynced} rows`);

        // Check parent completion (also updates account stats)
        await supabase.rpc("mark_parent_complete", { p_job_id: job.id });
      } else {
        const isPermanent = isPermanentError(jobErrorCode);
        const exhausted = job.attempts >= job.max_attempts;
        const isTimeoutOnChunk = jobErrorCode === "cpu_timeout" && isChunked;

        // SMART RETRY: timeout on chunked job → split into smaller sub-chunks
        if (isTimeoutOnChunk && !exhausted) {
          const subChunks = shrinkWindow(job.date_from!, job.date_to!);
          if (subChunks && subChunks.length > 1) {
            console.log(`🔪 Splitting timed-out chunk ${chunkLabel} into ${subChunks.length} sub-chunks`);
            // Mark this chunk done (its work will be redistributed)
            await supabase.from("sync_jobs").update({
              status: "done",
              rows_synced: 0,
              completed_at: new Date().toISOString(),
              last_error: `Auto-split into ${subChunks.length} smaller chunks`,
              error_code: "auto_split",
            }).eq("id", job.id);

            // Insert sub-chunks as siblings under the same parent
            const subRows = subChunks.map((c, idx) => ({
              ad_account_id: job.ad_account_id,
              function_name: job.function_name,
              status: "pending",
              org_id: job.org_id,
              parent_job_id: job.parent_job_id,
              chunk_index: (job.chunk_total ?? 0) + idx,
              chunk_total: (job.chunk_total ?? 0) + subChunks.length,
              date_from: c.from,
              date_to: c.to,
              chunk_strategy: "chunked",
            }));
            await supabase.from("sync_jobs").insert(subRows);

            // Update sibling chunk_total so parent completion math stays correct
            if (job.parent_job_id) {
              await supabase.from("sync_jobs").update({
                chunk_total: (job.chunk_total ?? 0) + subChunks.length,
              }).eq("parent_job_id", job.parent_job_id);
            }
            failed++;
            continue;
          }
        }

        const finalStatus = (isPermanent || exhausted) ? "failed" : "pending";

        await supabase.from("sync_jobs").update({
          status: finalStatus,
          last_error: jobError.substring(0, 500),
          error_code: jobErrorCode,
          scheduled_at: finalStatus === "pending"
            ? new Date(Date.now() + Math.min(job.attempts * 30000, 300000)).toISOString()
            : undefined,
          completed_at: finalStatus === "failed" ? new Date().toISOString() : null,
          started_at: finalStatus === "pending" ? null : undefined,
        }).eq("id", job.id);

        await supabase.from("sync_logs").insert({
          ad_account_id: job.ad_account_id,
          function_name: job.function_name,
          status: "failed",
          error_message: jobError,
          error_code: jobErrorCode,
          retry_count: job.attempts - 1,
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
        });
        failed++;
        console.error(`❌ Job ${job.id}${chunkLabel}: ${jobErrorCode} - ${jobError} (attempt ${job.attempts}/${job.max_attempts}, status: ${finalStatus})`);

        // If chunk permanently failed, trigger parent completion check
        if (finalStatus === "failed") {
          await supabase.rpc("mark_parent_complete", { p_job_id: job.id });
        }
      }
    }

    // Get remaining queue depth
    const { count: remaining } = await supabase
      .from("sync_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    const elapsed = Date.now() - startTime;
    console.log(`Worker complete in ${elapsed}ms: ${succeeded} ok, ${failed} fail, ${remaining ?? 0} remaining`);

    // Self-chain: if queue still has work, fire another worker (fire-and-forget)
    if ((remaining ?? 0) > 0 && elapsed < HARD_TIMEOUT_MS) {
      fetch(`${supabaseUrl}/functions/v1/sync-queue-worker`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({}),
      }).catch(() => {});
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: succeeded + failed,
        succeeded,
        failed,
        remaining: remaining ?? 0,
        elapsed_ms: elapsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("sync-queue-worker error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
