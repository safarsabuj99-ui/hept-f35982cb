import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateAccountIds(platform: string): string[] {
  const count = 3 + Math.floor(Math.random() * 6); // 3-8 accounts
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    switch (platform) {
      case "meta":
        ids.push(`act_${Math.floor(100000000 + Math.random() * 900000000)}`);
        break;
      case "tiktok":
        ids.push(`${Math.floor(7000000000 + Math.random() * 999999999)}`);
        break;
      case "google":
        ids.push(
          `${Math.floor(100 + Math.random() * 900)}-${Math.floor(100 + Math.random() * 900)}-${Math.floor(1000 + Math.random() * 9000)}`
        );
        break;
      default:
        ids.push(`unknown_${Math.floor(Math.random() * 999999)}`);
    }
  }
  return ids;
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

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Check admin role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { integration_ids, client_id } = body;

    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch selected integrations
    let query = adminClient.from("api_integrations").select("*").eq("is_active", true);
    if (integration_ids?.length) {
      query = query.in("id", integration_ids);
    }
    const { data: integrations, error: intError } = await query;
    if (intError) throw intError;

    if (!integrations?.length) {
      return new Response(
        JSON.stringify({ created: 0, skipped: 0, accounts: [], message: "No active integrations found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing account IDs to deduplicate
    const { data: existingAccounts } = await adminClient
      .from("ad_accounts")
      .select("ad_account_id, platform_name");

    const existingSet = new Set(
      (existingAccounts ?? []).map((a: any) => `${a.platform_name}:${a.ad_account_id}`)
    );

    let created = 0;
    let skipped = 0;
    const newAccounts: any[] = [];

    for (const integration of integrations) {
      const discoveredIds = generateAccountIds(integration.platform);

      for (const accountId of discoveredIds) {
        const key = `${integration.platform}:${accountId}`;
        if (existingSet.has(key)) {
          skipped++;
          continue;
        }

        newAccounts.push({
          ad_account_id: accountId,
          platform_name: integration.platform,
          client_id,
          api_integration_id: integration.id,
          billing_type: "prepaid",
          daily_spending_limit: 250,
          is_active: true,
          account_currency: "USD",
        });
        existingSet.add(key); // prevent dupes within same batch
      }
    }

    if (newAccounts.length > 0) {
      const { error: insertError } = await adminClient
        .from("ad_accounts")
        .insert(newAccounts);
      if (insertError) throw insertError;
      created = newAccounts.length;
    }

    return new Response(
      JSON.stringify({ created, skipped, accounts: newAccounts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
