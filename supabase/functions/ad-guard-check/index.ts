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
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Auth: support both admin bearer token and cron (anon key in Authorization)
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    let isCron = false;

    // Try to verify as user
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !caller) {
      // If auth fails, check if it's the anon key (cron call)
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      if (token === anonKey) {
        isCron = true;
      } else {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // If not cron, verify admin role
    if (!isCron && caller) {
      const { data: roleCheck } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").single();
      if (!roleCheck) {
        return new Response(JSON.stringify({ error: "Forbidden: Admin only" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get all client profiles
    const { data: clientRoles } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "client");
    const clientIds = (clientRoles ?? []).map((r: any) => r.user_id);

    if (clientIds.length === 0) {
      return new Response(JSON.stringify({ checked: 0, paused: 0, message: "No clients found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name, auto_pause_balance_usd, overdraft_limit_usd, system_paused_campaigns")
      .in("user_id", clientIds);

    const { data: allTxns } = await supabaseAdmin
      .from("transactions").select("client_id, type, amount, status");

    const results: any[] = [];
    let totalPaused = 0;

    for (const profile of profiles ?? []) {
      const clientTxns = (allTxns ?? []).filter(
        (t: any) => t.client_id === profile.user_id && t.status === "completed"
      );
      const totalDeposits = clientTxns
        .filter((t: any) => t.type === "credit")
        .reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalDebits = clientTxns
        .filter((t: any) => t.type === "debit")
        .reduce((s: number, t: any) => s + Number(t.amount), 0);

      const balance = totalDeposits - totalDebits;
      const pauseThreshold = Number(profile.auto_pause_balance_usd ?? 5);
      const clientOverdraft = Number(profile.overdraft_limit_usd ?? 0);
      const effectiveThreshold = clientOverdraft > 0 ? pauseThreshold : 0;

      const alreadyPaused = Array.isArray(profile.system_paused_campaigns)
        ? profile.system_paused_campaigns
        : [];

      if (balance <= effectiveThreshold && alreadyPaused.length === 0) {
        // Find active campaigns for this client from campaigns table
        const { data: activeCampaigns } = await supabaseAdmin
          .from("campaigns")
          .select("id, name, platform, platform_id, ad_account_id, status")
          .eq("client_id", profile.user_id)
          .in("status", ["active", "enable", "Active"]);

        if (activeCampaigns && activeCampaigns.length > 0) {
          const pausedIds: string[] = [];
          const pausedNames: string[] = [];

          for (const campaign of activeCampaigns) {
            // Call pause-campaign edge function to actually pause on platform
            try {
              const pauseRes = await fetch(
                `${supabaseUrl}/functions/v1/pause-campaign`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${serviceRoleKey}`,
                  },
                  body: JSON.stringify({
                    campaign_id: campaign.id,
                    action: "pause",
                  }),
                }
              );
              const pauseResult = await pauseRes.text();
              console.log(`Pause result for ${campaign.name}: ${pauseRes.status} ${pauseResult}`);
              
              // Even if API call fails, mark locally as guard_paused
              // The pause-campaign function may return 400 if already paused
            } catch (err) {
              console.error(`Failed to call pause-campaign for ${campaign.name}:`, err);
            }

            // Update campaign status to guard_paused
            await supabaseAdmin
              .from("campaigns")
              .update({ status: "guard_paused", updated_at: new Date().toISOString() })
              .eq("id", campaign.id);

            pausedIds.push(campaign.id);
            pausedNames.push(campaign.name || campaign.platform_id);
          }

          // Store paused campaign IDs + pause timestamp
          await supabaseAdmin.from("profiles")
            .update({
              system_paused_campaigns: pausedIds,
              guard_paused_at: new Date().toISOString(),
            })
            .eq("user_id", profile.user_id);

          // Audit log
          await supabaseAdmin.from("audit_logs").insert({
            user_id: profile.user_id,
            action_type: "ad_guard_pause",
            description: `Auto-paused ${pausedIds.length} campaigns for ${profile.full_name}: [${pausedNames.join(", ")}]. Balance: $${balance.toFixed(2)} (threshold: $${effectiveThreshold}). Triggered by ${isCron ? "scheduled scan" : "admin scan"}.`,
          });

          totalPaused += pausedIds.length;
          results.push({
            client: profile.full_name,
            balance: Math.round(balance * 100) / 100,
            threshold: effectiveThreshold,
            action: "PAUSED",
            campaigns_paused: pausedIds.length,
          });
        }
      } else if (balance <= effectiveThreshold && alreadyPaused.length > 0) {
        // Already paused — but check if campaigns.status was updated
        // Safety net: ensure guard_paused campaigns that somehow got set back to active are re-paused
        for (const campaignId of alreadyPaused) {
          const { data: camp } = await supabaseAdmin
            .from("campaigns")
            .select("id, status")
            .eq("id", campaignId)
            .single();

          if (camp && (camp.status === "active" || camp.status === "enable" || camp.status === "Active")) {
            // Campaign somehow became active again while balance is still low — re-pause
            try {
              await fetch(`${supabaseUrl}/functions/v1/pause-campaign`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({ campaign_id: campaignId, action: "pause" }),
              });
            } catch (err) {
              console.error(`Re-pause failed for ${campaignId}:`, err);
            }

            await supabaseAdmin
              .from("campaigns")
              .update({ status: "guard_paused", updated_at: new Date().toISOString() })
              .eq("id", campaignId);

            totalPaused++;
          }
        }

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
          threshold: pauseThreshold,
          action: "OK",
          campaigns_paused: 0,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: profiles?.length ?? 0,
        total_campaigns_paused: totalPaused,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
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
