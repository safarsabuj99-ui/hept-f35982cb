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

    // Get active ad accounts with integration tokens
    let accountQuery = supabase
      .from("ad_accounts")
      .select("id, ad_account_id, platform_name, client_id, api_integration_id, account_currency, exchange_rate, api_integrations!ad_accounts_api_integration_id_fkey(api_token, app_id, platform)")
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
    const globalStartDate = dateSetting?.value || "2025-01-01";
    const endDateStr = new Date().toISOString().split("T")[0];

    // Load ad_account_clients junction + client profiles for per-client start dates
    const { data: aacRows } = await supabase
      .from("ad_account_clients")
      .select("ad_account_id, client_id");

    const accountClientMap: Record<string, string[]> = {};
    for (const row of aacRows ?? []) {
      if (!accountClientMap[row.ad_account_id]) accountClientMap[row.ad_account_id] = [];
      accountClientMap[row.ad_account_id].push(row.client_id);
    }

    const allClientIds = [...new Set((aacRows ?? []).map(r => r.client_id))];
    const clientStartDates: Record<string, string | null> = {};

    if (allClientIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, data_fetch_start_date")
        .in("user_id", allClientIds);
      for (const p of profiles ?? []) {
        clientStartDates[p.user_id] = p.data_fetch_start_date;
      }
    }

    // Helper: get per-account start date (earliest linked client date >= global)
    const getAccountStartDate = (accountId: string): string => {
      const linkedClients = accountClientMap[accountId] || [];
      const dates = linkedClients
        .map(cid => clientStartDates[cid])
        .filter((d): d is string => !!d && d >= globalStartDate);
      if (dates.length > 0) {
        dates.sort();
        return dates[0];
      }
      return globalStartDate;
    };

    // Get exchange rate setting
    const { data: rateSetting } = await supabase
      .from("settings").select("value").eq("key", "exchange_rate").maybeSingle();
    const exchangeRate = rateSetting?.value ? Number(rateSetting.value) : 120;

    let syncedCount = 0;
    const errors: string[] = [];

    for (const account of accounts) {
      const integration = (account as any).api_integrations;
      const currency = account.account_currency || "USD";
      const platform = account.platform_name;

      const startDateStr = getAccountStartDate(account.id);

      try {
        if (platform === "meta") {
          // ===== META: Real API with time_increment=1 =====
          if (!integration?.api_token) {
            errors.push(`Meta ${account.ad_account_id}: No API token`);
            continue;
          }

          const insightsUrl = `https://graph.facebook.com/v21.0/${account.ad_account_id}/insights?fields=campaign_name,spend,date_start&time_range={"since":"${startDateStr}","until":"${endDateStr}"}&time_increment=1&limit=500&access_token=${integration.api_token}`;

          let allInsights: any[] = [];
          let nextUrl: string | null = insightsUrl;

          while (nextUrl) {
            const res = await fetch(nextUrl);
            const json = await res.json();
            if (json.error) { errors.push(`Meta ${account.ad_account_id}: ${json.error.message}`); break; }
            if (json.data?.length > 0) allInsights = allInsights.concat(json.data);
            nextUrl = json.paging?.next || null;
          }

          const spendRecords: any[] = [];
          for (const row of allInsights) {
            const spend = parseFloat(row.spend || "0");
            if (spend <= 0) continue;

            const isBDT = currency === "BDT";
            const accountRate = isBDT ? (account.exchange_rate ?? exchangeRate) : 1;
            const finalUsd = isBDT ? Math.round((spend / accountRate) * 100) / 100 : spend;

            spendRecords.push({
              ad_account_id: account.id,
              date: row.date_start, // API's actual date
              campaign_name: row.campaign_name || "Meta Spend",
              raw_spend_amount: spend,
              raw_currency: currency,
              exchange_rate_used: isBDT ? accountRate : 1,
              final_billable_usd: finalUsd,
              synced_at: new Date().toISOString(),
            });
          }

          for (let i = 0; i < spendRecords.length; i += 100) {
            const batch = spendRecords.slice(i, i + 100);
            const { error } = await supabase
              .from("daily_ad_spend")
              .upsert(batch, { onConflict: "ad_account_id,date,campaign_name", ignoreDuplicates: false });
            if (error) errors.push(`Meta ${account.ad_account_id} upsert: ${error.message}`);
          }

          console.log(`Meta fast-lane: ${spendRecords.length} rows for ${account.ad_account_id}`);

        } else if (platform === "google") {
          // ===== GOOGLE: Real API with segments.date =====
          if (!integration?.api_token) {
            errors.push(`Google ${account.ad_account_id}: No API token`);
            continue;
          }

          const customerId = account.ad_account_id.replace(/-/g, "");
          const gaqlQuery = `SELECT campaign.name, segments.date, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '${startDateStr}' AND '${endDateStr}'`;

          const res = await fetch(
            `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:searchStream`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${integration.api_token}`,
                "developer-token": integration.app_id || "",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ query: gaqlQuery }),
            }
          );

          const json = await res.json();
          if (!res.ok) {
            errors.push(`Google ${account.ad_account_id}: ${JSON.stringify(json.error?.message || json)}`);
            continue;
          }

          const results = json[0]?.results || [];
          const spendRecords: any[] = [];

          for (const row of results) {
            const costMicros = parseInt(row.metrics?.costMicros || "0", 10);
            const spend = costMicros / 1_000_000;
            if (spend <= 0) continue;

            spendRecords.push({
              ad_account_id: account.id,
              date: row.segments?.date,
              campaign_name: row.campaign?.name || "Google Campaign",
              raw_spend_amount: spend,
              raw_currency: currency,
              exchange_rate_used: 1,
              final_billable_usd: spend,
              synced_at: new Date().toISOString(),
            });
          }

          for (let i = 0; i < spendRecords.length; i += 100) {
            const batch = spendRecords.slice(i, i + 100);
            const { error } = await supabase
              .from("daily_ad_spend")
              .upsert(batch, { onConflict: "ad_account_id,date,campaign_name", ignoreDuplicates: false });
            if (error) errors.push(`Google ${account.ad_account_id} upsert: ${error.message}`);
          }

          console.log(`Google fast-lane: ${spendRecords.length} rows for ${account.ad_account_id}`);

        } else if (platform === "tiktok") {
          // ===== TIKTOK: Real API with stat_time_day =====
          if (!integration?.api_token) {
            errors.push(`TikTok ${account.ad_account_id}: No API token`);
            continue;
          }

          const params = new URLSearchParams({
            advertiser_id: account.ad_account_id,
            report_type: "BASIC",
            data_level: "AUCTION_ADVERTISER",
            dimensions: '["stat_time_day"]',
            metrics: '["spend"]',
            start_date: startDateStr,
            end_date: endDateStr,
            page_size: "500",
          });

          const res = await fetch(
            `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?${params}`,
            {
              headers: {
                "Access-Token": integration.api_token,
                "Content-Type": "application/json",
              },
            }
          );

          const json = await res.json();
          if (json.code !== 0) {
            errors.push(`TikTok ${account.ad_account_id}: ${json.message}`);
            continue;
          }

          const rows = json.data?.list || [];
          const spendRecords: any[] = [];

          for (const row of rows) {
            const spend = parseFloat(row.metrics?.spend || "0");
            if (spend <= 0) continue;

            const date = (row.dimensions?.stat_time_day || "").split(" ")[0];

            spendRecords.push({
              ad_account_id: account.id,
              date,
              campaign_name: "TikTok Spend",
              raw_spend_amount: spend,
              raw_currency: currency,
              exchange_rate_used: 1,
              final_billable_usd: spend,
              synced_at: new Date().toISOString(),
            });
          }

          for (let i = 0; i < spendRecords.length; i += 100) {
            const batch = spendRecords.slice(i, i + 100);
            const { error } = await supabase
              .from("daily_ad_spend")
              .upsert(batch, { onConflict: "ad_account_id,date,campaign_name", ignoreDuplicates: false });
            if (error) errors.push(`TikTok ${account.ad_account_id} upsert: ${error.message}`);
          }

          console.log(`TikTok fast-lane: ${spendRecords.length} rows for ${account.ad_account_id}`);
        }

        syncedCount++;
      } catch (err: any) {
        errors.push(`${platform} ${account.ad_account_id}: ${err.message}`);
      }
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
        errors: errors.length > 0 ? errors : undefined,
        date_range: { from: globalStartDate, to: endDateStr },
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
