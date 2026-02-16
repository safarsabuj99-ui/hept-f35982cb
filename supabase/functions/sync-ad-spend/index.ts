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

    // Get active ad accounts with their integration tokens
    const { data: adAccounts } = await supabaseAdmin
      .from("ad_accounts")
      .select("*, api_integrations!ad_accounts_api_integration_id_fkey(api_token, app_id, platform)")
      .eq("is_active", true);

    if (!adAccounts || adAccounts.length === 0) {
      return new Response(JSON.stringify({ error: "No active ad accounts found. Create ad accounts first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all ad_account_clients assignments (junction table with keywords)
    const { data: accountClients } = await supabaseAdmin
      .from("ad_account_clients")
      .select("ad_account_id, client_id, mapping_keyword");

    // Build a map: ad_account_id -> [{ client_id, keyword }]
    const accountKeywordMap: Record<string, { client_id: string; keyword: string }[]> = {};
    for (const ac of accountClients ?? []) {
      if (!accountKeywordMap[ac.ad_account_id]) accountKeywordMap[ac.ad_account_id] = [];
      if (ac.mapping_keyword && ac.mapping_keyword.trim()) {
        accountKeywordMap[ac.ad_account_id].push({
          client_id: ac.client_id,
          keyword: ac.mapping_keyword.trim().toLowerCase(),
        });
      }
    }

    // Get client profiles for fallback keyword matching and custom rates
    const { data: clientProfiles } = await supabaseAdmin
      .from("profiles").select("user_id, mapping_keyword, custom_exchange_rate, pricing_config");

    const profileKeywordMap: { keyword: string; userId: string }[] = [];
    const clientRates: Record<string, number | null> = {};
    for (const p of clientProfiles ?? []) {
      if (p.mapping_keyword && p.mapping_keyword.trim()) {
        profileKeywordMap.push({ keyword: p.mapping_keyword.trim().toLowerCase(), userId: p.user_id });
      }
      if (p.custom_exchange_rate) {
        clientRates[p.user_id] = Number(p.custom_exchange_rate);
      }
    }

    // Date range: last 30 days
    const today = new Date();
    const since = new Date(today);
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().split("T")[0];
    const untilStr = today.toISOString().split("T")[0];

    console.log(`Syncing spend from ${sinceStr} to ${untilStr} for ${adAccounts.length} accounts`);

    let totalRecords = 0;
    let totalSkipped = 0;
    let autoMapped = 0;
    let unmapped = 0;
    const errors: string[] = [];

    // Group accounts by platform
    const metaAccounts = adAccounts.filter((a: any) => a.platform_name === "meta");

    // ===== META: Fetch real spend via Insights API =====
    for (const account of metaAccounts) {
      const integration = account.api_integrations as any;
      if (!integration?.api_token) {
        errors.push(`${account.ad_account_id}: No API token found`);
        continue;
      }

      const apiToken = integration.api_token;
      const adAccountId = account.ad_account_id;
      const accountAssignments = accountKeywordMap[account.id] ?? [];

      try {
        // Fetch daily insights with campaign breakdown for 30 days
        const insightsUrl = `https://graph.facebook.com/v21.0/${adAccountId}/insights?fields=campaign_name,campaign_id,spend,date_start&time_range={"since":"${sinceStr}","until":"${untilStr}"}&time_increment=1&level=campaign&limit=500&access_token=${apiToken}`;
        
        console.log(`Fetching insights for ${adAccountId} (${account.account_name})...`);
        
        let allInsights: any[] = [];
        let nextUrl: string | null = insightsUrl;

        while (nextUrl) {
          const res = await fetch(nextUrl);
          const json = await res.json();
          if (json.error) { errors.push(`${adAccountId}: ${json.error.message}`); break; }
          if (json.data && json.data.length > 0) allInsights = allInsights.concat(json.data);
          nextUrl = json.paging?.next || null;
        }

        console.log(`Got ${allInsights.length} insight rows for ${account.account_name}`);
        if (allInsights.length === 0) continue;

        // Check existing records to avoid duplicates
        const { data: existingRecords } = await supabaseAdmin
          .from("daily_ad_spend")
          .select("date, campaign_name")
          .eq("ad_account_id", account.id)
          .gte("date", sinceStr)
          .lte("date", untilStr);

        const existingSet = new Set(
          (existingRecords ?? []).map((r: any) => `${r.date}|${r.campaign_name}`)
        );

        const records: any[] = [];
        const campaignMappings: any[] = [];

        for (const row of allInsights) {
          const spend = parseFloat(row.spend || "0");
          if (spend <= 0) continue;

          const date = row.date_start;
          const campaignName = row.campaign_name || "Unknown Campaign";
          const campaignId = row.campaign_id || `meta_${Date.now()}`;
          
          const key = `${date}|${campaignName}`;
          if (existingSet.has(key)) { totalSkipped++; continue; }

          const isBDT = account.account_currency === "BDT";
          const rawAmount = spend;

          // Step 1: Match against junction table keywords for this account
          let matchedClientId: string | null = null;
          const nameLower = campaignName.toLowerCase();
          for (const { client_id, keyword } of accountAssignments) {
            if (nameLower.includes(keyword)) { matchedClientId = client_id; break; }
          }

          // Step 2: Fallback to profile-level mapping_keyword
          if (!matchedClientId) {
            for (const { keyword, userId } of profileKeywordMap) {
              if (nameLower.includes(keyword)) { matchedClientId = userId; break; }
            }
          }

          // Determine effective exchange rate
          let effectiveRate = exchangeRate;
          if (matchedClientId && clientRates[matchedClientId]) {
            effectiveRate = clientRates[matchedClientId]!;
          }

          const finalBillableUsd = isBDT
            ? Math.round((rawAmount / effectiveRate) * 100) / 100
            : rawAmount;

          records.push({
            ad_account_id: account.id,
            date,
            campaign_name: campaignName,
            raw_spend_amount: rawAmount,
            raw_currency: account.account_currency,
            exchange_rate_used: isBDT ? effectiveRate : 1,
            final_billable_usd: finalBillableUsd,
          });

          campaignMappings.push({
            campaign_id: campaignId,
            campaign_name: campaignName,
            platform: "meta",
            ad_account_id: account.id,
            client_id: matchedClientId,
            is_active: true,
          });

          if (matchedClientId) autoMapped++;
          else unmapped++;

          existingSet.add(key);
        }

        // Insert in batches of 100
        for (let i = 0; i < records.length; i += 100) {
          const batch = records.slice(i, i + 100);
          const { error: insertError } = await supabaseAdmin.from("daily_ad_spend").insert(batch);
          if (insertError) errors.push(`${adAccountId} insert error: ${insertError.message}`);
        }

        // Upsert campaign mappings
        if (campaignMappings.length > 0) {
          const campaignIds = campaignMappings.map((c: any) => c.campaign_id);
          const { data: existingMappings } = await supabaseAdmin
            .from("campaign_mappings")
            .select("campaign_id")
            .in("campaign_id", campaignIds)
            .eq("platform", "meta");

          const existingCampaignIds = new Set((existingMappings ?? []).map((m: any) => m.campaign_id));
          const newMappings = campaignMappings.filter((c: any) => !existingCampaignIds.has(c.campaign_id));

          if (newMappings.length > 0) {
            await supabaseAdmin.from("campaign_mappings").insert(newMappings);
          }
        }

        totalRecords += records.length;
      } catch (err: any) {
        errors.push(`${adAccountId}: ${err.message}`);
      }
    }

    // ===== Refresh billing cycle data for all Meta accounts =====
    console.log("Refreshing billing cycle data for Meta accounts...");
    for (const account of metaAccounts) {
      const integration = account.api_integrations as any;
      if (!integration?.api_token) continue;
      const adAccountId = account.ad_account_id;
      try {
        const bcUrl = `https://graph.facebook.com/v21.0/${adAccountId}/adspaymentcycle?fields=threshold_amount,amount_spent,end_time&access_token=${integration.api_token}`;
        const bcRes = await fetch(bcUrl);
        if (!bcRes.ok) continue;
        const bcJson = await bcRes.json();
        const cycle = bcJson.data?.[0];
        if (!cycle) continue;

        const updateFields: Record<string, any> = {};
        if (cycle.threshold_amount) {
          updateFields.threshold_limit = Number(cycle.threshold_amount) / 100;
          updateFields.billing_type = "threshold_postpaid";
        }
        if (cycle.amount_spent !== undefined) {
          updateFields.current_threshold_spend = Number(cycle.amount_spent) / 100;
        }
        if (cycle.end_time) {
          const d = typeof cycle.end_time === "number"
            ? new Date(cycle.end_time * 1000)
            : new Date(cycle.end_time);
          if (!isNaN(d.getTime())) {
            updateFields.next_billing_date = d.toISOString().split("T")[0];
          }
        }

        if (Object.keys(updateFields).length > 0) {
          await supabaseAdmin.from("ad_accounts").update(updateFields).eq("id", account.id);
          console.log(`Updated billing data for ${adAccountId}: ${JSON.stringify(updateFields)}`);
        }
      } catch (err: any) {
        console.warn(`Failed to fetch billing cycle for ${adAccountId}: ${err.message}`);
      }
    }

    // Update last_synced_at
    await supabaseAdmin.from("api_integrations")
      .update({ last_synced_at: new Date().toISOString() }).eq("is_active", true);

    return new Response(
      JSON.stringify({
        success: true,
        records_created: totalRecords,
        records_skipped: totalSkipped,
        exchange_rate_used: exchangeRate,
        auto_mapped: autoMapped,
        unmapped,
        errors: errors.length > 0 ? errors : undefined,
        date_range: { from: sinceStr, to: untilStr },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
