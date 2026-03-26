import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Auth: accept service role key, anon key (cron), or admin JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    if (token === serviceRoleKey || token === anonKey) {
      // Trusted caller — proceed
    } else {
      // Verify as user JWT
      const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !caller) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Verify admin role
      const { data: roleCheck } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").single();
      if (!roleCheck) {
        return new Response(JSON.stringify({ error: "Forbidden: Admin only" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const results: any[] = [];
    let totalPaused = 0;
    let totalApiSuccess = 0;
    let totalApiFailed = 0;

    // ===== PHASE 1: Process all guard_paused campaigns via platform APIs =====
    const { data: guardPausedCampaigns } = await supabaseAdmin
      .from("campaigns")
      .select("id, name, platform, platform_id, ad_account_id, client_id, status")
      .eq("status", "guard_paused");

    if (guardPausedCampaigns && guardPausedCampaigns.length > 0) {
      console.log(`Phase 1: ${guardPausedCampaigns.length} guard_paused campaigns to sync with platform APIs`);

      for (const campaign of guardPausedCampaigns) {
        try {
          const pauseRes = await fetch(`${supabaseUrl}/functions/v1/pause-campaign`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ campaign_id: campaign.id, action: "pause" }),
          });

          const pauseText = await pauseRes.text();

          if (pauseRes.ok) {
            totalApiSuccess++;
            console.log(`✓ API pause succeeded for "${campaign.name}" (${campaign.platform})`);
          } else {
            totalApiFailed++;
            console.error(`✗ API pause failed for "${campaign.name}": ${pauseRes.status} ${pauseText}`);

            // Log individual failure
            await supabaseAdmin.from("audit_logs").insert({
              user_id: campaign.client_id || "00000000-0000-0000-0000-000000000000",
              action_type: "ad_guard_api_error",
              description: `Failed to pause "${campaign.name}" (${campaign.platform}) on platform API: ${pauseRes.status} ${pauseText.substring(0, 200)}`,
            });
          }
        } catch (err) {
          totalApiFailed++;
          console.error(`✗ API call error for "${campaign.name}":`, err);
        }
      }
    }

    // ===== PHASE 2: Scan all clients for active campaigns that should be paused =====
    const { data: clientRoles } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "client");
    const clientIds = (clientRoles ?? []).map((r: any) => r.user_id);

    if (clientIds.length === 0) {
      return new Response(JSON.stringify({
        checked: 0, paused: 0,
        api_success: totalApiSuccess, api_failed: totalApiFailed,
        message: "No clients found",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    for (const clientId of clientIds) {
      // Get balance via SQL SUM — no row limit issue
      const { data: balanceData } = await supabaseAdmin.rpc("get_client_balance_v2", { _client_id: clientId }).maybeSingle();

      // Fallback: calculate manually if RPC doesn't exist
      let balance: number;
      if (balanceData !== null && balanceData !== undefined) {
        balance = Number(balanceData);
      } else {
        // Manual calculation with pagination guard
        const { data: creditSum } = await supabaseAdmin
          .from("transactions")
          .select("amount")
          .eq("client_id", clientId)
          .eq("type", "credit")
          .eq("status", "completed");
        const { data: debitSum } = await supabaseAdmin
          .from("transactions")
          .select("amount")
          .eq("client_id", clientId)
          .eq("type", "debit")
          .eq("status", "completed");

        const credits = (creditSum ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
        const debits = (debitSum ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
        balance = credits - debits;
      }

      // Get profile settings
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, auto_pause_balance_usd, overdraft_limit_usd, system_paused_campaigns")
        .eq("user_id", clientId)
        .single();

      if (!profile) continue;

      const threshold = Number(profile.auto_pause_balance_usd ?? 5);
      const overdraft = Number(profile.overdraft_limit_usd ?? 0);
      const effectiveThreshold = threshold - overdraft;

      const alreadyPaused = Array.isArray(profile.system_paused_campaigns)
        ? profile.system_paused_campaigns
        : [];

      if (balance <= effectiveThreshold) {
        // Find active campaigns that haven't been caught by the trigger
        const { data: activeCampaigns } = await supabaseAdmin
          .from("campaigns")
          .select("id, name, platform, platform_id, ad_account_id")
          .eq("client_id", clientId)
          .in("status", ["active", "enable", "Active"]);

        if (activeCampaigns && activeCampaigns.length > 0) {
          const pausedIds: string[] = [];
          const pausedNames: string[] = [];

          for (const campaign of activeCampaigns) {
            // Mark as guard_paused in DB
            await supabaseAdmin
              .from("campaigns")
              .update({ status: "guard_paused", updated_at: new Date().toISOString() })
              .eq("id", campaign.id);

            // Call platform API
            try {
              const pauseRes = await fetch(`${supabaseUrl}/functions/v1/pause-campaign`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({ campaign_id: campaign.id, action: "pause" }),
              });

              if (pauseRes.ok) {
                totalApiSuccess++;
              } else {
                totalApiFailed++;
                const errText = await pauseRes.text();
                console.error(`Phase 2: API pause failed for "${campaign.name}": ${errText}`);
              }
            } catch (err) {
              totalApiFailed++;
              console.error(`Phase 2: API error for "${campaign.name}":`, err);
            }

            pausedIds.push(campaign.id);
            pausedNames.push(campaign.name || campaign.platform_id);
          }

          // Merge with existing paused list
          const allPausedIds = [...new Set([...alreadyPaused, ...pausedIds])];

          await supabaseAdmin.from("profiles").update({
            system_paused_campaigns: allPausedIds,
            guard_paused_at: new Date().toISOString(),
          }).eq("user_id", clientId);

          // Audit log
          await supabaseAdmin.from("audit_logs").insert({
            user_id: clientId,
            action_type: "ad_guard_pause",
            description: `Ad Guard paused ${pausedIds.length} campaigns for ${profile.full_name}: [${pausedNames.join(", ")}]. Balance: $${balance.toFixed(2)} (threshold: $${effectiveThreshold}).`,
          });

          totalPaused += pausedIds.length;
          results.push({
            client: profile.full_name,
            balance: Math.round(balance * 100) / 100,
            threshold: effectiveThreshold,
            action: "PAUSED",
            campaigns_paused: pausedIds.length,
          });
        } else if (alreadyPaused.length > 0) {
          results.push({
            client: profile.full_name,
            balance: Math.round(balance * 100) / 100,
            threshold: effectiveThreshold,
            action: "ALREADY_PAUSED",
            campaigns_paused: 0,
          });
        } else {
          results.push({
            client: profile.full_name,
            balance: Math.round(balance * 100) / 100,
            threshold: effectiveThreshold,
            action: "OK_NO_CAMPAIGNS",
            campaigns_paused: 0,
          });
        }
      } else {
        results.push({
          client: profile.full_name,
          balance: Math.round(balance * 100) / 100,
          threshold: effectiveThreshold,
          action: "OK",
          campaigns_paused: 0,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: clientIds.length,
        total_campaigns_paused: totalPaused,
        api_success: totalApiSuccess,
        api_failed: totalApiFailed,
        guard_paused_synced: guardPausedCampaigns?.length ?? 0,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("ad-guard-check critical error:", error);
    try {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabaseAdmin.from("audit_logs").insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        action_type: "ad_guard_critical_error",
        description: `Ad Guard engine failure: ${(error as Error).message}`,
      });
    } catch (_) { /* ignore logging failure */ }

    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
