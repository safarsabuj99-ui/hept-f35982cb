import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000]; // exponential backoff
const THROTTLE_MS = 200; // delay between accounts to prevent rate limiting
const CIRCUIT_BREAKER_THRESHOLD = 3; // stop after N consecutive same-error failures

/** Classify error codes from sync function responses */
function classifyError(errorMsg: string, errorCode?: string): string {
  if (!errorMsg) return "unknown";
  const msg = errorMsg.toLowerCase();
  if (errorCode === "token_expired" || msg.includes("error 190") || msg.includes("40001") || msg.includes("token") && msg.includes("expir")) return "token_expired";
  if (errorCode === "geo_blocked" || msg.includes("41000") || msg.includes("banned country")) return "geo_blocked";
  if (errorCode === "rate_limited" || msg.includes("429") || msg.includes("rate limit")) return "rate_limited";
  if (msg.includes("cpu time exceeded") || msg.includes("timeout")) return "cpu_timeout";
  return errorCode || "api_error";
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

    console.log(`Orchestrator starting for: ${targetFunction}`);

    // Get all mapped ad accounts with keywords
    const { data: mappedAssignments } = await supabase
      .from("ad_account_clients")
      .select("ad_account_id")
      .neq("mapping_keyword", "");

    if (!mappedAssignments || mappedAssignments.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No mapped accounts", accounts_processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mappedAccountIds = [...new Set(mappedAssignments.map(r => r.ad_account_id))];

    // Get active ad accounts - sort by data volume (ascending) so smaller accounts go first
    const { data: accounts } = await supabase
      .from("ad_accounts")
      .select("id, account_name, ad_account_id, platform_name, api_integration_id")
      .eq("is_active", true)
      .in("id", mappedAccountIds);

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No active mapped accounts", accounts_processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sort by estimated data volume — get recent sync_logs to estimate
    const { data: recentLogs } = await supabase
      .from("sync_logs")
      .select("ad_account_id, rows_synced")
      .eq("function_name", targetFunction)
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(accounts.length * 2);

    const volumeMap: Record<string, number> = {};
    for (const log of recentLogs ?? []) {
      if (!volumeMap[log.ad_account_id]) {
        volumeMap[log.ad_account_id] = log.rows_synced || 0;
      }
    }

    // Sort accounts: smallest data volume first
    accounts.sort((a, b) => (volumeMap[a.id] || 0) - (volumeMap[b.id] || 0));

    // Check token health for alerting
    const integrationIds = [...new Set(accounts.map(a => a.api_integration_id).filter(Boolean))];
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
          // Find accounts using this integration
          const affectedAccounts = accounts.filter(a => a.api_integration_id === integration.id);
          for (const acc of affectedAccounts) {
            // Check if alert already exists in last 24h
            const { data: existingAlert } = await supabase
              .from("billing_notifications")
              .select("id")
              .eq("ad_account_id", acc.id)
              .eq("alert_type", "token_expiry_warning")
              .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
              .limit(1);

            if (!existingAlert?.length) {
              // Get any client_id linked to this account
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

    // Process each account individually with throttling + circuit breaker
    const results: { account_id: string; account_name: string; status: string; error?: string; rows_synced?: number }[] = [];
    let successCount = 0;
    let failCount = 0;
    let consecutiveSameError = 0;
    let lastErrorCode = "";

    for (let accountIdx = 0; accountIdx < accounts.length; accountIdx++) {
      const account = accounts[accountIdx];

      // Throttle: wait between accounts (skip first)
      if (accountIdx > 0) {
        await new Promise(r => setTimeout(r, THROTTLE_MS));
      }
      // Circuit breaker: stop if N consecutive accounts fail with same error
      if (consecutiveSameError >= CIRCUIT_BREAKER_THRESHOLD) {
        console.error(`⚡ Circuit breaker triggered: ${consecutiveSameError} consecutive "${lastErrorCode}" errors. Stopping.`);
        results.push({ account_id: account.id, account_name: account.account_name, status: "skipped", error: `Circuit breaker: ${lastErrorCode}` });
        failCount++;
        continue;
      }

      let accountError = "";
      let accountErrorCode = "";
      let rowsSynced = 0;
      let succeeded = false;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
          console.log(`Retry ${attempt}/${MAX_RETRIES} for ${account.account_name} after ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
        }

        // Create sync_log entry
        const { data: logEntry } = await supabase
          .from("sync_logs")
          .insert({
            ad_account_id: account.id,
            function_name: targetFunction,
            status: attempt === 0 ? "running" : "retrying",
            retry_count: attempt,
            started_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        try {
          // Call the target function with single account
          const response = await fetch(`${supabaseUrl}/functions/v1/${targetFunction}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${anonKey}`,
            },
            body: JSON.stringify({ ad_account_ids: [account.id] }),
          });

          const responseData = await response.json();

          if (!response.ok || responseData.error) {
            accountError = responseData.error || `HTTP ${response.status}`;
            accountErrorCode = classifyError(accountError, responseData.error_code);

            // Update sync_log as failed
            if (logEntry) {
              await supabase.from("sync_logs").update({
                status: "failed",
                error_message: accountError,
                error_code: accountErrorCode,
                completed_at: new Date().toISOString(),
              }).eq("id", logEntry.id);
            }

            // Don't retry token_expired errors
            if (accountErrorCode === "token_expired") {
              console.error(`Token expired for ${account.account_name}, not retrying`);
              break;
            }

            continue; // retry
          }

          // Success
          rowsSynced = responseData.synced || responseData.accounts_synced || responseData.records_upserted || 0;
          succeeded = true;

          if (logEntry) {
            await supabase.from("sync_logs").update({
              status: "success",
              rows_synced: rowsSynced,
              completed_at: new Date().toISOString(),
            }).eq("id", logEntry.id);
          }

          break; // exit retry loop
        } catch (err: any) {
          accountError = err.message || "Unknown error";
          accountErrorCode = classifyError(accountError);

          if (logEntry) {
            await supabase.from("sync_logs").update({
              status: "failed",
              error_message: accountError,
              error_code: accountErrorCode,
              completed_at: new Date().toISOString(),
            }).eq("id", logEntry.id);
          }
        }
      }

      if (succeeded) {
        successCount++;
        consecutiveSameError = 0; // reset circuit breaker
        lastErrorCode = "";
        results.push({ account_id: account.id, account_name: account.account_name, status: "success", rows_synced: rowsSynced });
        console.log(`✅ ${account.account_name}: ${rowsSynced} rows`);
      } else {
        failCount++;
        // Track circuit breaker
        if (accountErrorCode === lastErrorCode && lastErrorCode !== "") {
          consecutiveSameError++;
        } else {
          consecutiveSameError = 1;
          lastErrorCode = accountErrorCode;
        }
        results.push({ account_id: account.id, account_name: account.account_name, status: "failed", error: accountError });
        console.error(`❌ ${account.account_name}: ${accountErrorCode} - ${accountError} (consecutive: ${consecutiveSameError})`);

        // Check for consecutive failures (5+) to auto-alert
        const { data: recentFailures } = await supabase
          .from("sync_logs")
          .select("id")
          .eq("ad_account_id", account.id)
          .eq("function_name", targetFunction)
          .eq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(5);

        if (recentFailures && recentFailures.length >= 5) {
          const { data: clientLink } = await supabase
            .from("ad_account_clients")
            .select("client_id")
            .eq("ad_account_id", account.id)
            .limit(1)
            .single();

          if (clientLink) {
            const { data: existingAlert } = await supabase
              .from("billing_notifications")
              .select("id")
              .eq("ad_account_id", account.id)
              .eq("alert_type", "sync_persistent_failure")
              .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
              .limit(1);

            if (!existingAlert?.length) {
              await supabase.from("billing_notifications").insert({
                ad_account_id: account.id,
                client_id: clientLink.client_id,
                alert_type: "sync_persistent_failure",
                priority: "critical",
                message: `${account.account_name} has failed ${targetFunction} sync 5+ times consecutively. Last error: ${accountErrorCode}. Manual intervention required.`,
              });
            }
          }
        }
      }
    }

    // Cleanup old sync_logs (older than 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("sync_logs").delete().lt("created_at", thirtyDaysAgo);

    console.log(`Orchestrator complete: ${successCount} success, ${failCount} failed out of ${accounts.length} accounts`);

    return new Response(
      JSON.stringify({
        ok: true,
        function: targetFunction,
        accounts_total: accounts.length,
        accounts_success: successCount,
        accounts_failed: failCount,
        results,
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
