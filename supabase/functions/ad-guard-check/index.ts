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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify admin caller
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").single();
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all client profiles with guard settings
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

    // Get active campaign mappings
    const { data: allCampaigns } = await supabaseAdmin
      .from("campaign_mappings").select("id, campaign_id, campaign_name, client_id, is_active").eq("is_active", true);

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

      // Overdraft-aware pause logic:
      // - If client has overdraft (> 0): pause when balance <= threshold
      // - If client has NO overdraft (0): only pause when balance <= 0
      const effectiveThreshold = clientOverdraft > 0 ? pauseThreshold : 0;

      const alreadyPaused = Array.isArray(profile.system_paused_campaigns)
        ? profile.system_paused_campaigns
        : [];

      if (balance <= effectiveThreshold && alreadyPaused.length === 0) {
        // Find active campaigns for this client
        const clientCampaigns = (allCampaigns ?? []).filter(
          (c: any) => c.client_id === profile.user_id
        );

        if (clientCampaigns.length > 0) {
          const pausedIds = clientCampaigns.map((c: any) => c.campaign_id);
          const pausedNames = clientCampaigns.map((c: any) => c.campaign_name || c.campaign_id);

          // Mark campaigns as inactive (simulated pause)
          for (const c of clientCampaigns) {
            await supabaseAdmin.from("campaign_mappings")
              .update({ is_active: false })
              .eq("id", c.id);
          }

          // Store paused campaign IDs + pause timestamp
          await supabaseAdmin.from("profiles")
            .update({ system_paused_campaigns: pausedIds, guard_paused_at: new Date().toISOString() })
            .eq("user_id", profile.user_id);

          // Audit log — use client's user_id so history appears on their profile
          // Include campaign names so history persists even after resume
          await supabaseAdmin.from("audit_logs").insert({
            user_id: profile.user_id,
            action_type: "ad_guard_pause",
            description: `Auto-paused ${pausedIds.length} campaigns for ${profile.full_name}: [${pausedNames.join(", ")}]. Balance: $${balance.toFixed(2)} (threshold: $${effectiveThreshold}). Triggered by admin scan.`,
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
      } else {
        results.push({
          client: profile.full_name,
          balance: Math.round(balance * 100) / 100,
          threshold: pauseThreshold,
          action: balance <= effectiveThreshold ? "ALREADY_PAUSED" : "OK",
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
    // Log critical error
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
