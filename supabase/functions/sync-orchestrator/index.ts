import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Find which accounts already have an active job (pending/processing) for this function
    const { data: existingJobs } = await supabase
      .from("sync_jobs")
      .select("ad_account_id")
      .eq("function_name", targetFunction)
      .in("status", ["pending", "processing"]);

    const alreadyQueued = new Set((existingJobs || []).map(j => j.ad_account_id));
    const toEnqueue = accounts.filter(a => !alreadyQueued.has(a.id));

    let enqueued = 0;
    if (toEnqueue.length > 0) {
      const rows = toEnqueue.map(a => ({
        ad_account_id: a.id,
        function_name: targetFunction,
        status: "pending",
        org_id: a.org_id,
      }));

      // Insert with conflict handling (unique partial index protects us)
      const { data: inserted, error: insertError } = await supabase
        .from("sync_jobs")
        .insert(rows)
        .select("id");

      if (insertError) {
        console.error("Enqueue error:", insertError);
      } else {
        enqueued = inserted?.length ?? 0;
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

    // Fire-and-forget trigger first worker run for instant start
    fetch(`${supabaseUrl}/functions/v1/sync-queue-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${anonKey}`,
      },
      body: JSON.stringify({}),
    }).catch(err => console.error("Worker trigger failed:", err));

    // Cleanup old sync_logs (>30 days) and old done/failed jobs (>7 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("sync_logs").delete().lt("created_at", thirtyDaysAgo);
    await supabase.from("sync_jobs").delete().in("status", ["done", "failed"]).lt("completed_at", sevenDaysAgo);

    console.log(`Orchestrator: enqueued ${enqueued} new jobs, queue depth: ${queueDepth ?? 0}`);

    return new Response(
      JSON.stringify({
        ok: true,
        function: targetFunction,
        accounts_total: accounts.length,
        skipped_already_queued: alreadyQueued.size,
        enqueued,
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
