import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Platform status check helpers ---

async function checkMetaStatus(rawId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${rawId}?fields=effective_status&access_token=${token}`
    );
    const json = await res.json();
    return json.effective_status || null;
  } catch { return null; }
}

async function checkGoogleStatus(customerId: string, rawId: string, token: string, devToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "developer-token": devToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: `SELECT campaign.status FROM campaign WHERE campaign.id = ${rawId}` }),
      }
    );
    const json = await res.json();
    const status = json?.[0]?.results?.[0]?.campaign?.status;
    return status || null;
  } catch { return null; }
}

async function checkTikTokStatus(advertiserId: string, rawId: string, token: string, tiktokBase: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${tiktokBase}/open_api/v1.3/campaign/get/?advertiser_id=${advertiserId}&filtering={"campaign_ids":["${rawId}"]}&fields=["operation_status"]`,
      { headers: { "Access-Token": token } }
    );
    const json = await res.json();
    const status = json?.data?.list?.[0]?.operation_status;
    return status || null;
  } catch { return null; }
}

function isOffStatus(platform: string, status: string | null): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  if (platform === "meta") return ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "ARCHIVED", "DELETED", "DISAPPROVED", "WITH_ISSUES", "NOT_DELIVERING"].includes(s);
  if (platform === "google") return ["PAUSED", "REMOVED"].includes(s);
  if (platform === "tiktok") return ["DISABLE", "DELETE", "CAMPAIGN_STATUS_DISABLE"].includes(s);
  return false;
}

function isOnStatus(platform: string, status: string | null): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  if (platform === "meta") return s === "ACTIVE";
  if (platform === "google") return s === "ENABLED";
  if (platform === "tiktok") return ["ENABLE", "CAMPAIGN_STATUS_ENABLE"].includes(s);
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    let user: any = null;
    let isServiceCall = false;

    if (token === svcKey) {
      isServiceCall = true;
    } else {
      const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !caller) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user = caller;
    }

    const { campaign_id, action = "pause" } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isEnableAction = action === "enable";

    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("id, platform_id, platform, ad_account_id, status, name")
      .eq("id", campaign_id)
      .single();

    if (campErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize legacy raw statuses for guard checks
    const normalizedStatus = campaign.status.toLowerCase() === "enable" ? "active"
      : campaign.status.toLowerCase() === "disable" ? "paused"
      : campaign.status.toLowerCase() === "guard_paused" ? "active" // Still needs platform pause
      : campaign.status;

    // Check if already in desired state (skip for service calls — DB trigger may have set guard_paused)
    if (!isEnableAction && normalizedStatus === "paused" && !isServiceCall) {
      return new Response(JSON.stringify({ error: "Campaign is already paused." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (isEnableAction && normalizedStatus === "active" && !isServiceCall) {
      return new Response(JSON.stringify({ error: "Campaign is already active." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Permission check — skip for service calls (ad-guard, cron)
    let isAdmin = isServiceCall;
    if (!isServiceCall) {
      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      isAdmin = !!roleData;

      if (isEnableAction && !isAdmin) {
        return new Response(JSON.stringify({ error: "Only admins can enable campaigns" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!isAdmin) {
        const { data: ownership } = await supabase
          .from("ad_account_clients").select("id")
          .eq("ad_account_id", campaign.ad_account_id).eq("client_id", user.id).maybeSingle();
        if (!ownership) {
          return new Response(JSON.stringify({ error: "You don't have permission for this campaign" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }
    // Get API credentials
    const { data: adAccount } = await supabase
      .from("ad_accounts").select("api_integration_id, ad_account_id, platform_name")
      .eq("id", campaign.ad_account_id).single();

    if (!adAccount?.api_integration_id) {
      return new Response(JSON.stringify({ error: "No API integration configured for this ad account" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integration } = await supabase
      .from("api_integrations").select("api_token, app_id, platform")
      .eq("id", adAccount.api_integration_id).single();

    if (!integration?.api_token) {
      return new Response(JSON.stringify({ error: "API token not available" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const platformId = campaign.platform_id;
    const rawId = platformId.replace(/^(meta_|google_|tiktok_)/, "");
    const platform = campaign.platform;
    let apiSuccess = false;
    let apiMessage = "";
    let alreadyInState = false;
    let localOnly = false;

    // Get TikTok proxy URL setting
    const { data: proxySetting } = await supabase
      .from("settings").select("value").eq("key", "tiktok_proxy_url").maybeSingle();
    const tiktokProxyUrl = proxySetting?.value || null;
    const tiktokBase = tiktokProxyUrl ? tiktokProxyUrl.replace(/\/+$/, "") : "https://business-api.tiktok.com";

    if (platform === "meta") {
      const targetStatus = isEnableAction ? "ACTIVE" : "PAUSED";
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${rawId}?access_token=${integration.api_token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ status: targetStatus }).toString(),
        }
      );
      const json = await res.json();
      if (json.success || res.ok) {
        apiSuccess = true;
      } else {
        const currentStatus = await checkMetaStatus(rawId, integration.api_token);
        if (isEnableAction ? isOnStatus("meta", currentStatus) : isOffStatus("meta", currentStatus)) {
          alreadyInState = true;
        } else {
          apiMessage = json.error?.message || "Meta API error";
        }
      }
    } else if (platform === "google") {
      const customerId = adAccount.ad_account_id.replace(/-/g, "");
      const targetStatus = isEnableAction ? "ENABLED" : "PAUSED";
      const res = await fetch(
        `https://googleads.googleapis.com/v18/customers/${customerId}/campaigns:mutate`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${integration.api_token}`,
            "developer-token": integration.app_id || "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            operations: [{
              update: { resourceName: `customers/${customerId}/campaigns/${rawId}`, status: targetStatus },
              updateMask: "status",
            }],
          }),
        }
      );
      const json = await res.json();
      if (res.ok) {
        apiSuccess = true;
      } else {
        const currentStatus = await checkGoogleStatus(customerId, rawId, integration.api_token, integration.app_id || "");
        if (isEnableAction ? isOnStatus("google", currentStatus) : isOffStatus("google", currentStatus)) {
          alreadyInState = true;
        } else {
          apiMessage = json.error?.message || "Google API error";
        }
      }
    } else if (platform === "tiktok") {
      const optStatus = isEnableAction ? "ENABLE" : "DISABLE";
      console.log(`TikTok ${action}: calling ${tiktokBase}/open_api/v1.3/campaign/status/update/ with advertiser_id=${adAccount.ad_account_id}, campaign=${rawId}, operation_status=${optStatus}`);
      const res = await fetch(
        `${tiktokBase}/open_api/v1.3/campaign/status/update/`,
        {
          method: "POST",
          headers: { "Access-Token": integration.api_token, "Content-Type": "application/json" },
          body: JSON.stringify({
            advertiser_id: adAccount.ad_account_id,
            campaign_ids: [rawId],
            operation_status: optStatus,
          }),
        }
      );
      const resText = await res.text();
      console.log(`TikTok ${action} response: ${resText}`);
      let json: any;
      try { json = JSON.parse(resText); } catch { json = { code: -1, message: resText }; }
      if (json.code === 0) {
        apiSuccess = true;
      } else if (json.code === 41000 || (json.message && json.message.includes("banned Country"))) {
        // Geo-restriction — check actual status and sync if already correct
        const currentStatus = await checkTikTokStatus(adAccount.ad_account_id, rawId, integration.api_token, tiktokBase);
        console.log(`TikTok geo-blocked, checking current status: ${currentStatus}`);
        if (currentStatus === null) {
          // Both read and write are geo-blocked — apply locally only
          apiSuccess = true;
          localOnly = true;
          console.log("TikTok fully geo-blocked, applying local-only update");
        } else if (isEnableAction ? isOnStatus("tiktok", currentStatus) : isOffStatus("tiktok", currentStatus)) {
          alreadyInState = true;
        } else {
          // Write blocked but read works and status doesn't match — apply locally with warning
          apiSuccess = true;
          localOnly = true;
          console.log("TikTok write geo-blocked but status differs, applying local-only update");
        }
      } else {
        const currentStatus = await checkTikTokStatus(adAccount.ad_account_id, rawId, integration.api_token, tiktokBase);
        if (isEnableAction ? isOnStatus("tiktok", currentStatus) : isOffStatus("tiktok", currentStatus)) {
          alreadyInState = true;
        } else {
          apiMessage = json.message || "TikTok API error";
        }
      }
    }

    if (!apiSuccess && !alreadyInState) {
      return new Response(JSON.stringify({ error: `Failed to ${action} on platform: ${apiMessage}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update local DB
    const newStatus = isEnableAction ? "active" : "paused";
    await supabase
      .from("campaigns")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", campaign_id);

    const actionVerb = isEnableAction ? "enabled" : "paused";
    const auditDesc = localOnly
      ? `Campaign "${campaign.name}" (${platform}) ${actionVerb} locally — platform API geo-restricted`
      : alreadyInState
        ? `Campaign "${campaign.name}" (${platform}) was already ${actionVerb} on platform — local status synced`
        : `${isEnableAction ? "Enabled" : "Paused"} campaign "${campaign.name}" (${platform}) via dashboard`;

    await supabase.from("audit_logs").insert({
      user_id: user?.id || "00000000-0000-0000-0000-000000000000",
      action_type: isEnableAction ? "campaign_enabled" : "campaign_paused",
      description: auditDesc,
    });

    const message = localOnly
      ? `Campaign "${campaign.name}" has been ${actionVerb} locally. Platform-side change could not be confirmed due to geo-restriction.`
      : alreadyInState
        ? `Campaign "${campaign.name}" was already ${actionVerb} on the platform — local status updated`
        : `Campaign "${campaign.name}" has been ${actionVerb}`;

    return new Response(
      JSON.stringify({ success: true, message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("pause-campaign error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
