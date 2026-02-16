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
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse optional client_id for manual sync
    let targetClientId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        targetClientId = body.client_id || null;
      } catch { /* no body is fine for cron */ }
    }

    // Get active ad accounts (optionally filtered by client)
    let accountQuery = supabase
      .from("ad_accounts")
      .select("id, ad_account_id, platform_name, client_id, api_integration_id, account_currency")
      .eq("is_active", true);

    if (targetClientId) {
      accountQuery = accountQuery.eq("client_id", targetClientId);
    }

    const { data: accounts, error: accErr } = await accountQuery;
    if (accErr) throw accErr;
    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active accounts to sync", synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read configurable sync start date from settings
    const { data: dateSetting } = await supabase
      .from("settings").select("value").eq("key", "sync_start_date").maybeSingle();
    const startDateStr = dateSetting?.value || "2025-01-01";

    // Generate date range from start date to today
    const dates: string[] = [];
    const startDt = new Date(startDateStr);
    const endDt = new Date();
    for (let d = new Date(startDt); d <= endDt; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split("T")[0]);
    }

    let syncedCount = 0;

    for (const account of accounts) {
      const currency = account.account_currency || "USD";
      const exchangeRate = currency === "BDT" ? 110 : 1;

      for (const date of dates) {
        // Mock realistic spend for each historical date ($0.50 - $15.00)
        const spendIncrement = Math.round((Math.random() * 14.5 + 0.5) * 100) / 100;
        const finalUsd =
          currency === "BDT"
            ? Math.round((spendIncrement / exchangeRate) * 100) / 100
            : spendIncrement;

        // Upsert spend record with the actual platform date
        const { error: spendErr } = await supabase
          .from("daily_ad_spend")
          .upsert(
            {
              ad_account_id: account.id,
              date,
              campaign_name: "Fast Lane Sync",
              raw_spend_amount: spendIncrement,
              raw_currency: currency,
              exchange_rate_used: exchangeRate,
              final_billable_usd: finalUsd,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "ad_account_id,date", ignoreDuplicates: false }
          );

        if (spendErr) {
          // If upsert fails (no unique constraint), do insert
          await supabase.from("daily_ad_spend").insert({
            ad_account_id: account.id,
            date,
            campaign_name: "Fast Lane Sync",
            raw_spend_amount: spendIncrement,
            raw_currency: currency,
            exchange_rate_used: exchangeRate,
            final_billable_usd: finalUsd,
            synced_at: new Date().toISOString(),
          });
        }
      }

      syncedCount++;
    }

    // Update last_synced_at on api_integrations
    const integrationIds = [
      ...new Set(accounts.map((a) => a.api_integration_id).filter(Boolean)),
    ];
    if (integrationIds.length > 0) {
      await supabase
        .from("api_integrations")
        .update({ last_synced_at: new Date().toISOString() })
        .in("id", integrationIds);
    }

    return new Response(
      JSON.stringify({
        message: `Fast lane sync complete`,
        synced: syncedCount,
        days_covered: dates.length,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("sync-fast-lane error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
