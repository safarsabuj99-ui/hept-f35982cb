import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const START_TIME = Date.now();
const TIMEOUT_MS = 22_000; // Stop at 22s to leave margin for response
const BATCH_SIZE = 5;

function timeLeft(): number {
  return TIMEOUT_MS - (Date.now() - START_TIME);
}

// ===== Inline platform pause helpers =====

interface PausableGroup {
  platform: string;
  apiToken: string;
  appId: string;
  tiktokBase: string;
  adAccountRawId: string;
  campaigns: Array<{
    id: string;
    name: string;
    platformId: string;
    clientId: string | null;
  }>;
}

async function pauseTikTokCampaign(
  advertiserId: string,
  rawCampaignId: string,
  token: string,
  tiktokBase: string
): Promise<{ success: boolean; message: string; localOnly?: boolean }> {
  try {
    const res = await fetch(`${tiktokBase}/open_api/v1.3/campaign/status/update/`, {
      method: "POST",
      headers: { "Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        advertiser_id: advertiserId,
        campaign_ids: [rawCampaignId],
        operation_status: "DISABLE",
      }),
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = { code: -1, message: text }; }

    if (json.code === 0) return { success: true, message: "OK" };

    // Geo-restriction fallback
    if (json.code === 41000 || json.message?.includes("banned Country")) {
      return { success: true, message: "Geo-restricted, local-only", localOnly: true };
    }

    return { success: false, message: json.message || `TikTok error ${json.code}` };
  } catch (err: any) {
    return { success: false, message: err.message || "Network error" };
  }
}

async function pauseMetaCampaign(
  rawCampaignId: string,
  token: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${rawCampaignId}?access_token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ status: "PAUSED" }).toString(),
      }
    );
    const json = await res.json();
    if (json.success || res.ok) return { success: true, message: "OK" };
    return { success: false, message: json.error?.message || "Meta API error" };
  } catch (err: any) {
    return { success: false, message: err.message || "Network error" };
  }
}

async function pauseGoogleCampaign(
  customerId: string,
  rawCampaignId: string,
  token: string,
  devToken: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(
      `https://googleads.googleapis.com/v18/customers/${customerId}/campaigns:mutate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "developer-token": devToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operations: [{
            update: {
              resourceName: `customers/${customerId}/campaigns/${rawCampaignId}`,
              status: "PAUSED",
            },
            updateMask: "status",
          }],
        }),
      }
    );
    const json = await res.json();
    if (res.ok) return { success: true, message: "OK" };
    return { success: false, message: json.error?.message || "Google API error" };
  } catch (err: any) {
    return { success: false, message: err.message || "Network error" };
  }
}

async function pauseOnPlatform(
  campaign: { id: string; name: string; platformId: string },
  platform: string,
  apiToken: string,
  appId: string,
  adAccountRawId: string,
  tiktokBase: string
): Promise<{ success: boolean; message: string; localOnly?: boolean }> {
  const rawId = campaign.platformId.replace(/^(meta_|google_|tiktok_)/, "");

  if (platform === "tiktok") {
    return pauseTikTokCampaign(adAccountRawId, rawId, apiToken, tiktokBase);
  } else if (platform === "meta") {
    return pauseMetaCampaign(rawId, apiToken);
  } else if (platform === "google") {
    const customerId = adAccountRawId.replace(/-/g, "");
    return pauseGoogleCampaign(customerId, rawId, apiToken, appId);
  }
  return { success: false, message: `Unsupported platform: ${platform}` };
}

// ===== Main handler =====

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const sb = createClient(supabaseUrl, serviceRoleKey);

    // Auth: accept service role key, anon key (cron), or admin JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    if (token !== serviceRoleKey && token !== anonKey) {
      const { data: { user: caller }, error: authError } = await sb.auth.getUser(token);
      if (authError || !caller) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleCheck } = await sb
        .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").single();
      if (!roleCheck) {
        return new Response(JSON.stringify({ error: "Forbidden: Admin only" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get TikTok proxy URL once
    const { data: proxySetting } = await sb
      .from("settings").select("value").eq("key", "tiktok_proxy_url").maybeSingle();
    const tiktokBase = proxySetting?.value?.replace(/\/+$/, "") || "https://business-api.tiktok.com";

    let totalPaused = 0;
    let totalApiSuccess = 0;
    let totalApiFailed = 0;
    let timedOut = false;
    const results: any[] = [];

    // ===== PHASE 1: Process guard_paused campaigns directly via platform APIs =====
    const { data: guardPaused } = await sb
      .from("campaigns")
      .select("id, name, platform, platform_id, ad_account_id, client_id, status")
      .eq("status", "guard_paused");

    if (guardPaused && guardPaused.length > 0) {
      console.log(`Phase 1: ${guardPaused.length} guard_paused campaigns`);

      // Group by ad_account_id to share API credentials
      const groups = new Map<string, PausableGroup>();
      const adAccountIds = [...new Set(guardPaused.map(c => c.ad_account_id))];

      // Fetch all ad accounts + integrations in one go
      const { data: adAccounts } = await sb
        .from("ad_accounts")
        .select("id, ad_account_id, platform_name, api_integration_id")
        .in("id", adAccountIds);

      const integrationIds = [...new Set((adAccounts || []).map(a => a.api_integration_id).filter(Boolean))];
      const { data: integrations } = await sb
        .from("api_integrations")
        .select("id, api_token, app_id, platform")
        .in("id", integrationIds as string[]);

      const intMap = new Map((integrations || []).map(i => [i.id, i]));
      const accMap = new Map((adAccounts || []).map(a => [a.id, a]));

      for (const camp of guardPaused) {
        const acc = accMap.get(camp.ad_account_id);
        if (!acc?.api_integration_id) continue;
        const int = intMap.get(acc.api_integration_id);
        if (!int?.api_token) continue;

        const key = camp.ad_account_id;
        if (!groups.has(key)) {
          groups.set(key, {
            platform: camp.platform,
            apiToken: int.api_token,
            appId: int.app_id || "",
            tiktokBase,
            adAccountRawId: acc.ad_account_id,
            campaigns: [],
          });
        }
        groups.get(key)!.campaigns.push({
          id: camp.id,
          name: camp.name,
          platformId: camp.platform_id,
          clientId: camp.client_id,
        });
      }

      // Process all campaigns in parallel batches
      const allCampaigns: Array<{
        campaign: { id: string; name: string; platformId: string; clientId: string | null };
        group: PausableGroup;
      }> = [];

      for (const group of groups.values()) {
        for (const c of group.campaigns) {
          allCampaigns.push({ campaign: c, group });
        }
      }

      for (let i = 0; i < allCampaigns.length; i += BATCH_SIZE) {
        if (timeLeft() < 3000) {
          console.log(`⏱ Timeout approaching, processed ${i}/${allCampaigns.length} campaigns`);
          timedOut = true;
          break;
        }

        const batch = allCampaigns.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map(async ({ campaign, group }) => {
            const result = await pauseOnPlatform(
              campaign, group.platform, group.apiToken, group.appId,
              group.adAccountRawId, group.tiktokBase
            );

            if (result.success) {
              // Update DB: guard_paused → paused (confirmed on platform)
              await sb.from("campaigns")
                .update({ status: "paused", updated_at: new Date().toISOString() })
                .eq("id", campaign.id);
              totalApiSuccess++;
              console.log(`✓ ${campaign.name} (${group.platform}) paused on platform${result.localOnly ? " [local-only]" : ""}`);
            } else {
              totalApiFailed++;
              console.error(`✗ ${campaign.name} (${group.platform}): ${result.message}`);
              // Log failure
              await sb.from("audit_logs").insert({
                user_id: campaign.clientId || "00000000-0000-0000-0000-000000000000",
                action_type: "ad_guard_api_error",
                description: `Ad Guard API fail for "${campaign.name}" (${group.platform}): ${result.message.substring(0, 200)}`,
              });
            }
            return result;
          })
        );
      }
    }

    // ===== PHASE 2: Scan for active campaigns on low-balance clients =====
    // INSTANT PAUSE: immediately calls platform API (no "next cycle" delay)
    if (timeLeft() > 5000) {
      // Optimized: only get clients who actually have active campaigns
      const { data: activeCampaigns } = await sb
        .from("campaigns")
        .select("id, name, platform, platform_id, ad_account_id, client_id")
        .in("status", ["active", "enable", "Active"])
        .not("client_id", "is", null);

      if (activeCampaigns && activeCampaigns.length > 0) {
        // Group by client_id
        const clientCampaigns = new Map<string, typeof activeCampaigns>();
        for (const c of activeCampaigns) {
          if (!c.client_id) continue;
          if (!clientCampaigns.has(c.client_id)) clientCampaigns.set(c.client_id, []);
          clientCampaigns.get(c.client_id)!.push(c);
        }

        const clientIds = [...clientCampaigns.keys()];

        // Pre-fetch ad accounts + integrations for immediate platform pause
        const allAdAccountIdsP2 = [...new Set(activeCampaigns.map(c => c.ad_account_id))];
        const { data: adAccountsP2 } = await sb
          .from("ad_accounts")
          .select("id, ad_account_id, platform_name, api_integration_id")
          .in("id", allAdAccountIdsP2);
        const integrationIdsP2 = [...new Set((adAccountsP2 || []).map(a => a.api_integration_id).filter(Boolean))];
        const { data: integrationsP2 } = await sb
          .from("api_integrations")
          .select("id, api_token, app_id, platform")
          .in("id", integrationIdsP2 as string[]);
        const intMapP2 = new Map((integrationsP2 || []).map(i => [i.id, i]));
        const accMapP2 = new Map((adAccountsP2 || []).map(a => [a.id, a]));

        for (const clientId of clientIds) {
          if (timeLeft() < 3000) {
            timedOut = true;
            break;
          }

          // Get balance via RPC
          const { data: balanceData } = await sb
            .rpc("get_client_balance_v2", { _client_id: clientId })
            .maybeSingle();

          let balance: number;
          if (balanceData !== null && balanceData !== undefined) {
            balance = Number(balanceData);
          } else {
            // Fallback: manual SUM
            const { data: creditSum } = await sb
              .from("transactions").select("amount")
              .eq("client_id", clientId).eq("type", "credit").eq("status", "completed");
            const { data: debitSum } = await sb
              .from("transactions").select("amount")
              .eq("client_id", clientId).eq("type", "debit").eq("status", "completed");
            const credits = (creditSum ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
            const debits = (debitSum ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
            balance = credits - debits;
          }

          const { data: profile } = await sb
            .from("profiles")
            .select("full_name, auto_pause_balance_usd, overdraft_limit_usd, system_paused_campaigns")
            .eq("user_id", clientId)
            .single();

          if (!profile) continue;

          const threshold = Number(profile.auto_pause_balance_usd ?? 5);
          const overdraft = Number(profile.overdraft_limit_usd ?? 0);
          const effectiveThreshold = threshold - overdraft;
          const alreadyPaused = Array.isArray(profile.system_paused_campaigns)
            ? profile.system_paused_campaigns : [];

          if (balance <= effectiveThreshold) {
            const camps = clientCampaigns.get(clientId) || [];
            if (camps.length > 0) {
              const pausedIds: string[] = [];
              const pausedNames: string[] = [];
              let apiOk = 0;
              let apiFail = 0;

              for (const campaign of camps) {
                // Step 1: Mark as guard_paused in DB
                await sb.from("campaigns")
                  .update({ status: "guard_paused", updated_at: new Date().toISOString() })
                  .eq("id", campaign.id);
                pausedIds.push(campaign.id);
                pausedNames.push(campaign.name || campaign.platform_id);

                // Step 2: IMMEDIATELY pause on platform API
                const acc = accMapP2.get(campaign.ad_account_id);
                if (acc?.api_integration_id) {
                  const int = intMapP2.get(acc.api_integration_id);
                  if (int?.api_token) {
                    const result = await pauseOnPlatform(
                      campaign, campaign.platform, int.api_token, int.app_id || "",
                      acc.ad_account_id, tiktokBase
                    );
                    if (result.success) {
                      await sb.from("campaigns")
                        .update({ status: "paused", updated_at: new Date().toISOString() })
                        .eq("id", campaign.id);
                      apiOk++;
                      console.log(`✓ Phase2 instant: ${campaign.name} (${campaign.platform}) paused on platform`);
                    } else {
                      apiFail++;
                      console.error(`✗ Phase2 instant: ${campaign.name} (${campaign.platform}): ${result.message}`);
                    }
                  }
                }
              }

              const allPausedIds = [...new Set([...alreadyPaused.map(String), ...pausedIds])];
              await sb.from("profiles").update({
                system_paused_campaigns: allPausedIds,
                guard_paused_at: new Date().toISOString(),
              }).eq("user_id", clientId);

              await sb.from("audit_logs").insert({
                user_id: clientId,
                action_type: "ad_guard_pause",
                description: `Ad Guard paused ${pausedIds.length} campaigns for ${profile.full_name}: [${pausedNames.join(", ")}]. Balance: $${balance.toFixed(2)} (threshold: $${effectiveThreshold}). API: ${apiOk} ok, ${apiFail} failed.`,
              });

              totalPaused += pausedIds.length;
              totalApiSuccess += apiOk;
              totalApiFailed += apiFail;
              results.push({
                client: profile.full_name,
                balance: Math.round(balance * 100) / 100,
                threshold: effectiveThreshold,
                action: "INSTANT_PAUSED",
                campaigns_flagged: pausedIds.length,
                api_success: apiOk,
                api_failed: apiFail,
              });
            }
          } else {
            results.push({
              client: profile.full_name,
              balance: Math.round(balance * 100) / 100,
              threshold: effectiveThreshold,
              action: "OK",
            });
          }
        }
      }
    }

    const elapsed = Date.now() - START_TIME;
    return new Response(
      JSON.stringify({
        success: true,
        elapsed_ms: elapsed,
        timed_out: timedOut,
        phase1_synced: guardPaused?.length ?? 0,
        phase1_api_success: totalApiSuccess,
        phase1_api_failed: totalApiFailed,
        phase2_flagged: totalPaused,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("ad-guard-check critical error:", error);
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from("audit_logs").insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        action_type: "ad_guard_critical_error",
        description: `Ad Guard engine failure: ${(error as Error).message}`,
      });
    } catch (_) { /* ignore */ }

    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
