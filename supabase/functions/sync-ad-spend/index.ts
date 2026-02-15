import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CAMPAIGN_NAMES = [
  "Summer Sale 2026",
  "Brand Awareness Q1",
  "Retargeting - Cart Abandon",
  "Lookalike Audience - US",
  "Video Views Campaign",
  "Lead Gen - Webinar",
  "Product Launch",
  "Holiday Promo",
  "App Install Drive",
  "Engagement Boost",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify admin
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: caller },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .single();

    if (!roleCheck) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin only" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get current exchange rate
    const { data: rateSetting } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "exchange_rate")
      .maybeSingle();
    const exchangeRate = rateSetting?.value ? Number(rateSetting.value) : 120;

    // Get active ad accounts
    const { data: adAccounts } = await supabaseAdmin
      .from("ad_accounts")
      .select("*")
      .eq("is_active", true);

    if (!adAccounts || adAccounts.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No active ad accounts found. Create ad accounts first.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const today = new Date();
    const records: any[] = [];

    // Generate 5-15 random entries across ad accounts
    const count = Math.floor(Math.random() * 11) + 5;
    for (let i = 0; i < count; i++) {
      const account =
        adAccounts[Math.floor(Math.random() * adAccounts.length)];
      const daysAgo = Math.floor(Math.random() * 7);
      const spendDate = new Date(today);
      spendDate.setDate(spendDate.getDate() - daysAgo);

      const isBDT = account.account_currency === "BDT";
      const rawAmount = isBDT
        ? Math.round((Math.random() * 50000 + 1000) * 100) / 100
        : Math.round((Math.random() * 500 + 10) * 100) / 100;

      const finalBillableUsd = isBDT
        ? Math.round((rawAmount / exchangeRate) * 100) / 100
        : rawAmount;

      records.push({
        ad_account_id: account.id,
        date: spendDate.toISOString().split("T")[0],
        campaign_name:
          CAMPAIGN_NAMES[Math.floor(Math.random() * CAMPAIGN_NAMES.length)],
        raw_spend_amount: rawAmount,
        raw_currency: account.account_currency,
        exchange_rate_used: isBDT ? exchangeRate : 1,
        final_billable_usd: finalBillableUsd,
      });
    }

    const { error: insertError } = await supabaseAdmin
      .from("daily_ad_spend")
      .insert(records);

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update last_synced_at on api_integrations
    await supabaseAdmin
      .from("api_integrations")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("is_active", true);

    return new Response(
      JSON.stringify({
        success: true,
        records_created: records.length,
        exchange_rate_used: exchangeRate,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
