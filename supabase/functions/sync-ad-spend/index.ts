import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CAMPAIGN_NAMES = [
  "Summer Sale 2026", "Brand Awareness Q1", "Retargeting - Cart Abandon",
  "Lookalike Audience - US", "Video Views Campaign", "Lead Gen - Webinar",
  "Product Launch", "Holiday Promo", "App Install Drive", "Engagement Boost",
];

const EXPENSE_CATEGORIES = ["Rent", "Salary", "Software", "Owner_Draw", "Marketing", "Other"];

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

    // Get settings
    const { data: rateSetting } = await supabaseAdmin
      .from("settings").select("value").eq("key", "exchange_rate").maybeSingle();
    const exchangeRate = rateSetting?.value ? Number(rateSetting.value) : 120;

    // Get active ad accounts
    const { data: adAccounts } = await supabaseAdmin
      .from("ad_accounts").select("*").eq("is_active", true);
    if (!adAccounts || adAccounts.length === 0) {
      return new Response(JSON.stringify({ error: "No active ad accounts found. Create ad accounts first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get client profiles with mapping keywords, custom rates, and pricing configs
    const { data: clientProfiles } = await supabaseAdmin
      .from("profiles").select("user_id, mapping_keyword, custom_exchange_rate, pricing_config");

    const keywordMap: { keyword: string; userId: string }[] = [];
    const clientRates: Record<string, number | null> = {};
    for (const p of clientProfiles ?? []) {
      if (p.mapping_keyword && p.mapping_keyword.trim()) {
        keywordMap.push({ keyword: p.mapping_keyword.trim().toLowerCase(), userId: p.user_id });
      }
      if (p.custom_exchange_rate) {
        clientRates[p.user_id] = Number(p.custom_exchange_rate);
      }
    }

    const today = new Date();
    const records: any[] = [];
    const campaignMappings: any[] = [];
    let autoMapped = 0, unmapped = 0;

    // Generate 5-15 random spend entries
    const count = Math.floor(Math.random() * 11) + 5;
    for (let i = 0; i < count; i++) {
      const account = adAccounts[Math.floor(Math.random() * adAccounts.length)];
      const daysAgo = Math.floor(Math.random() * 7);
      const spendDate = new Date(today);
      spendDate.setDate(spendDate.getDate() - daysAgo);

      const isBDT = account.account_currency === "BDT";
      const rawAmount = isBDT
        ? Math.round((Math.random() * 50000 + 1000) * 100) / 100
        : Math.round((Math.random() * 500 + 10) * 100) / 100;

      let campaignName = CAMPAIGN_NAMES[Math.floor(Math.random() * CAMPAIGN_NAMES.length)];
      if (keywordMap.length > 0 && Math.random() < 0.3) {
        const kw = keywordMap[Math.floor(Math.random() * keywordMap.length)];
        campaignName = `${kw.keyword.toUpperCase()}_${campaignName}`;
      }

      // Auto-mapping
      let matchedClientId: string | null = null;
      const nameLower = campaignName.toLowerCase();
      for (const { keyword, userId } of keywordMap) {
        if (nameLower.includes(keyword)) { matchedClientId = userId; break; }
      }

      // Tiered rate
      let effectiveRate = exchangeRate;
      if (matchedClientId && clientRates[matchedClientId]) {
        effectiveRate = clientRates[matchedClientId]!;
      }

      const finalBillableUsd = isBDT
        ? Math.round((rawAmount / effectiveRate) * 100) / 100
        : rawAmount;

      records.push({
        ad_account_id: account.id, date: spendDate.toISOString().split("T")[0],
        campaign_name: campaignName, raw_spend_amount: rawAmount,
        raw_currency: account.account_currency, exchange_rate_used: isBDT ? effectiveRate : 1,
        final_billable_usd: finalBillableUsd,
      });

      campaignMappings.push({
        campaign_id: `sim_${Date.now()}_${i}`, campaign_name: campaignName,
        platform: account.platform_name, ad_account_id: account.id,
        client_id: matchedClientId, is_active: true,
      });

      if (matchedClientId) autoMapped++; else unmapped++;
    }

    const { error: insertError } = await supabaseAdmin.from("daily_ad_spend").insert(records);
    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (campaignMappings.length > 0) {
      await supabaseAdmin.from("campaign_mappings").insert(campaignMappings);
    }

    // === BILLING SIMULATION ===
    const THRESHOLD_LIMITS = [10, 25, 250];
    for (const acc of adAccounts) {
      const isThreshold = Math.random() > 0.5;
      const billingType = isThreshold ? "threshold_postpaid" : "prepaid";
      const thresholdLimit = THRESHOLD_LIMITS[Math.floor(Math.random() * THRESHOLD_LIMITS.length)];
      // Simulate high usage (>= 80%) for some accounts
      const spendMultiplier = Math.random() > 0.4 ? 0.8 + Math.random() * 0.2 : Math.random() * 0.7;
      const currentSpend = isThreshold ? Math.round(thresholdLimit * spendMultiplier * 100) / 100 : 0;
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + Math.floor(Math.random() * 3) + 1);
      const cardLast4 = String(Math.floor(1000 + Math.random() * 9000));

      await supabaseAdmin.from("ad_accounts").update({
        billing_type: billingType,
        threshold_limit: thresholdLimit,
        current_threshold_spend: currentSpend,
        next_billing_date: isThreshold ? tomorrow.toISOString().split("T")[0] : null,
        card_last_4: isThreshold ? cardLast4 : null,
      }).eq("id", acc.id);
    }

    await supabaseAdmin.from("api_integrations")
      .update({ last_synced_at: new Date().toISOString() }).eq("is_active", true);

    // === FINANCE SIMULATION ===
    // Generate USD purchases to establish WAC
    const usdPurchases: any[] = [];
    const purchaseCount = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < purchaseCount; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      const pDate = new Date(today);
      pDate.setDate(pDate.getDate() - daysAgo);
      const bdtPaid = Math.round((Math.random() * 50000 + 10000) * 100) / 100;
      const usdReceived = Math.round((bdtPaid / (120 + Math.random() * 20 - 10)) * 100) / 100;
      usdPurchases.push({
        date: pDate.toISOString().split("T")[0],
        bdt_amount_paid: bdtPaid,
        usd_received: usdReceived,
        notes: `Simulation purchase #${i + 1}`,
        created_by: caller.id,
      });
    }
    await supabaseAdmin.from("usd_purchases").insert(usdPurchases);

    // Generate expenses
    const expenseEntries: any[] = [];
    const expCount = Math.floor(Math.random() * 5) + 3;
    for (let i = 0; i < expCount; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      const eDate = new Date(today);
      eDate.setDate(eDate.getDate() - daysAgo);
      const cat = EXPENSE_CATEGORIES[Math.floor(Math.random() * EXPENSE_CATEGORIES.length)];
      const amt = cat === "Salary" ? Math.round(Math.random() * 30000 + 15000)
        : cat === "Rent" ? Math.round(Math.random() * 10000 + 5000)
        : cat === "Owner_Draw" ? Math.round(Math.random() * 20000 + 5000)
        : Math.round(Math.random() * 5000 + 500);
      expenseEntries.push({
        date: eDate.toISOString().split("T")[0],
        amount_bdt: amt,
        category: cat,
        description: `Sim: ${cat} expense`,
        created_by: caller.id,
      });
    }
    await supabaseAdmin.from("agency_expenses").insert(expenseEntries);

    // Assign random pricing_config to clients that don't have one
    const { data: allClientRoles } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "client");
    for (const cr of allClientRoles ?? []) {
      const { data: profile } = await supabaseAdmin
        .from("profiles").select("pricing_config").eq("user_id", cr.user_id).single();
      if (!profile?.pricing_config) {
        const isFlat = Math.random() > 0.5;
        const config = isFlat
          ? { mode: "flat_rate", rates: { meta: 140 + Math.round(Math.random() * 20), tiktok: 145 + Math.round(Math.random() * 15), google: 150 + Math.round(Math.random() * 15) } }
          : { mode: "percentage", markup: Math.round(10 + Math.random() * 15) };
        await supabaseAdmin.from("profiles")
          .update({ pricing_config: config }).eq("user_id", cr.user_id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true, records_created: records.length,
        exchange_rate_used: exchangeRate, auto_mapped: autoMapped, unmapped,
        finance_sim: { usd_purchases: usdPurchases.length, expenses: expenseEntries.length },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
