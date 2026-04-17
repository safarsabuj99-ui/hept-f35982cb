import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 1; // 1 job per worker — sync-deep-dive is heavy (~20s/account)
const HARD_TIMEOUT_MS = 23000; // exit cleanly under 25s edge limit
const PER_JOB_TIMEOUT_MS = 22000;

function classifyError(errorMsg: string, errorCode?: string): string {
  if (!errorMsg) return "unknown";
  const msg = errorMsg.toLowerCase();
  if (errorCode === "token_expired" || msg.includes("error 190") || msg.includes("40001") || (msg.includes("token") && msg.includes("expir"))) return "token_expired";
  if (errorCode === "geo_blocked" || msg.includes("41000") || msg.includes("banned country")) return "geo_blocked";
  if (errorCode === "rate_limited" || msg.includes("429") || msg.includes("rate limit")) return "rate_limited";
  if (msg.includes("cpu time exceeded") || msg.includes("timeout")) return "cpu_timeout";
  return errorCode || "api_error";
}

function isPermanentError(code: string): boolean {
  return code === "token_expired" || code === "geo_blocked";
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
      // Check hard timeout — exit early if needed, leftover jobs auto-recover
      if (Date.now() - startTime > HARD_TIMEOUT_MS) {
        console.log(`Hard timeout reached, exiting with ${claimedJobs.length - succeeded - failed} jobs unprocessed`);
        break;
      }

      let jobError = "";
      let jobErrorCode = "";
      let rowsSynced = 0;
      let success = false;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), PER_JOB_TIMEOUT_MS);

        const response = await fetch(`${supabaseUrl}/functions/v1/${job.function_name}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ ad_account_ids: [job.ad_account_id] }),
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

        // Mirror to sync_logs for history
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
        console.log(`✅ Job ${job.id}: ${rowsSynced} rows`);
      } else {
        const isPermanent = isPermanentError(jobErrorCode);
        const exhausted = job.attempts >= job.max_attempts;
        const finalStatus = (isPermanent || exhausted) ? "failed" : "pending";

        await supabase.from("sync_jobs").update({
          status: finalStatus,
          last_error: jobError.substring(0, 500),
          error_code: jobErrorCode,
          // For retry, push scheduled_at out with backoff
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
        console.error(`❌ Job ${job.id}: ${jobErrorCode} - ${jobError} (attempt ${job.attempts}/${job.max_attempts}, status: ${finalStatus})`);
      }
    }

    // Get remaining queue depth
    const { count: remaining } = await supabase
      .from("sync_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    const elapsed = Date.now() - startTime;
    console.log(`Worker complete in ${elapsed}ms: ${succeeded} ok, ${failed} fail, ${remaining ?? 0} remaining`);

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
