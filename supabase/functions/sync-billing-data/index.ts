import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Meta: fetch account-level billing data ──
async function syncMetaBilling(adAccountId: string, token: string) {
  const result: Record<string, any> = {};

  // 1. Account-level fields: spend_cap, amount_spent, balance
  try {
    const url = `https://graph.facebook.com/v21.0/${adAccountId}?fields=spend_cap,amount_spent,balance,currency,account_status&access_token=${token}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      // spend_cap is in cents (string), 0 means no limit
      if (data.spend_cap) {
        const capCents = Number(data.spend_cap);
        result.account_spending_limit = capCents > 0 ? capCents / 100 : null;
      }
    }
  } catch { /* skip */ }

  // 2. Billing cycle: threshold_amount, amount_spent, end_time
  try {
    const url = `https://graph.facebook.com/v21.0/${adAccountId}/adspaymentcycle?fields=threshold_amount,amount_spent,end_time&access_token=${token}`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      const cycle = json.data?.[0];
      if (cycle) {
        if (cycle.threshold_amount) {
          result.threshold_limit = Number(cycle.threshold_amount) / 100;
          result.billing_type = "threshold_postpaid";
        }
        if (cycle.amount_spent !== undefined) {
          result.current_threshold_spend = Number(cycle.amount_spent) / 100;
        }
        if (cycle.end_time) {
          const d = typeof cycle.end_time === "number"
            ? new Date(cycle.end_time * 1000)
            : new Date(cycle.end_time);
          if (!isNaN(d.getTime())) {
            result.next_billing_date = d.toISOString().split("T")[0];
          }
        }
      }
    }
  } catch { /* skip */ }

  return result;
}

// ── TikTok: fetch advertiser balance info ──
async function syncTikTokBilling(adAccountId: string, token: string) {
  const result: Record<string, any> = {};
  try {
    const url = `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=${JSON.stringify([adAccountId])}`;
    const res = await fetch(url, {
      headers: { "Access-Token": token, "Content-Type": "application/json" },
    });
    if (res.ok) {
      const json = await res.json();
      const adv = json.data?.list?.[0];
      if (adv) {
        // TikTok returns balance in the advertiser info
        if (adv.balance !== undefined) {
          result.account_spending_limit = Number(adv.balance);
        }
      }
    }
  } catch { /* skip */ }
  return result;
}

// ── Google: fetch account budget info ──
async function syncGoogleBilling(adAccountId: string, token: string) {
  // Google Ads billing data requires more complex setup
  // For now, return empty — can be extended with AccountBudget queries
  return {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Check admin role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { ad_account_id } = body;

    if (!ad_account_id) {
      return new Response(JSON.stringify({ error: "ad_account_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the ad account with its integration
    const { data: account, error: acctError } = await adminClient
      .from("ad_accounts")
      .select("*, api_integrations:api_integration_id(id, platform, api_token, app_id)")
      .eq("id", ad_account_id)
      .single();

    if (acctError || !account) {
      return new Response(JSON.stringify({ error: "Ad account not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const integration = (account as any).api_integrations;
    if (!integration) {
      return new Response(
        JSON.stringify({ error: "No API integration linked to this account. Cannot sync." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch live billing data based on platform
    let billingData: Record<string, any> = {};

    switch (integration.platform) {
      case "meta":
        billingData = await syncMetaBilling(account.ad_account_id, integration.api_token);
        break;
      case "tiktok":
        billingData = await syncTikTokBilling(account.ad_account_id, integration.api_token);
        break;
      case "google":
        billingData = await syncGoogleBilling(account.ad_account_id, integration.api_token);
        break;
    }

    // Only update fields that were actually fetched
    const updatePayload: Record<string, any> = {};
    const updatedFields: string[] = [];

    if (billingData.account_spending_limit !== undefined) {
      updatePayload.account_spending_limit = billingData.account_spending_limit;
      updatedFields.push("Account Spending Limit");
    }
    if (billingData.threshold_limit !== undefined) {
      updatePayload.threshold_limit = billingData.threshold_limit;
      updatedFields.push("Threshold Limit");
    }
    if (billingData.current_threshold_spend !== undefined) {
      updatePayload.current_threshold_spend = billingData.current_threshold_spend;
      updatedFields.push("Current Threshold Spend");
    }
    if (billingData.next_billing_date !== undefined) {
      updatePayload.next_billing_date = billingData.next_billing_date;
      updatedFields.push("Next Billing Date");
    }
    if (billingData.billing_type !== undefined) {
      updatePayload.billing_type = billingData.billing_type;
      updatedFields.push("Billing Type");
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await adminClient
        .from("ad_accounts")
        .update(updatePayload)
        .eq("id", ad_account_id);

      if (updateError) throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        updated_fields: updatedFields,
        data: updatePayload,
        message: updatedFields.length > 0
          ? `Synced: ${updatedFields.join(", ")}`
          : "No billing data available from platform API",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
