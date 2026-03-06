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

async function checkTikTokStatus(advertiserId: string, rawId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=${advertiserId}&filtering={"campaign_ids":["${rawId}"]}&fields=["operation_status"]`,
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
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    if (campaign.status === "paused") {
      return new Response(JSON.stringify({ error: "Campaign is already paused. Clients cannot resume campaigns." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Permission check
    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = !!roleData;

    if (!isAdmin) {
      const { data: ownership } = await supabase
        .from("ad_account_clients").select("id")
        .eq("ad_account_id", campaign.ad_account_id).eq("client_id", user.id).maybeSingle();
      if (!ownership) {
        return new Response(JSON.stringify({ error: "You don't have permission to pause this campaign" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
    let alreadyOff = false;

    if (platform === "meta") {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${rawId}?access_token=${integration.api_token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ status: "PAUSED" }).toString(),
        }
      );
      const json = await res.json();
      if (json.success || res.ok) {
        apiSuccess = true;
      } else {
        // Pause failed — check if already off on platform
        const currentStatus = await checkMetaStatus(rawId, integration.api_token);
        if (isOffStatus("meta", currentStatus)) {
          alreadyOff = true;
        } else {
          apiMessage = json.error?.message || "Meta API error";
        }
      }
    } else if (platform === "google") {
      const customerId = adAccount.ad_account_id.replace(/-/g, "");
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
              update: { resourceName: `customers/${customerId}/campaigns/${rawId}`, status: "PAUSED" },
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
        if (isOffStatus("google", currentStatus)) {
          alreadyOff = true;
        } else {
          apiMessage = json.error?.message || "Google API error";
        }
      }
    } else if (platform === "tiktok") {
      const res = await fetch(
        "https://business-api.tiktok.com/open_api/v1.3/campaign/status/update/",
        {
          method: "POST",
          headers: { "Access-Token": integration.api_token, "Content-Type": "application/json" },
          body: JSON.stringify({
            advertiser_id: adAccount.ad_account_id,
            campaign_ids: [rawId],
            opt_status: "DISABLE",
          }),
        }
      );
      const json = await res.json();
      if (json.code === 0) {
        apiSuccess = true;
      } else {
        const currentStatus = await checkTikTokStatus(adAccount.ad_account_id, rawId, integration.api_token);
        if (isOffStatus("tiktok", currentStatus)) {
          alreadyOff = true;
        } else {
          apiMessage = json.message || "TikTok API error";
        }
      }
    }

    if (!apiSuccess && !alreadyOff) {
      return new Response(JSON.stringify({ error: `Failed to pause on platform: ${apiMessage}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update local DB
    await supabase
      .from("campaigns")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", campaign_id);

    const auditDesc = alreadyOff
      ? `Campaign "${campaign.name}" (${platform}) was already off on platform — local status synced`
      : `Paused campaign "${campaign.name}" (${platform}) via client dashboard`;

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action_type: "campaign_paused",
      description: auditDesc,
    });

    const message = alreadyOff
      ? `Campaign "${campaign.name}" was already off on the platform — local status updated`
      : `Campaign "${campaign.name}" has been paused`;

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
