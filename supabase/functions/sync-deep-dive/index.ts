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

    // Get active ad accounts with integration tokens
    const { data: accounts, error: accErr } = await supabase
      .from("ad_accounts")
      .select("id, ad_account_id, platform_name, client_id, api_integration_id, api_integrations!ad_accounts_api_integration_id_fkey(api_token, app_id, platform)")
      .eq("is_active", true);

    if (accErr) throw accErr;
    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active accounts", synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get campaign mappings for client_id resolution
    const { data: campaignMappings } = await supabase
      .from("campaign_mappings")
      .select("campaign_id, client_id")
      .eq("is_active", true);

    const campaignClientMap: Record<string, string | null> = {};
    for (const m of campaignMappings ?? []) {
      campaignClientMap[m.campaign_id] = m.client_id;
    }

    // Read configurable sync start date
    const { data: dateSetting } = await supabase
      .from("settings").select("value").eq("key", "sync_start_date").maybeSingle();
    const startDateStr = dateSetting?.value || "2025-01-01";
    const endDateStr = new Date().toISOString().split("T")[0];

    let totalSynced = 0;
    const errors: string[] = [];

    for (const account of accounts) {
      const integration = (account as any).api_integrations;
      const platform = account.platform_name;

      try {
        if (platform === "meta") {
          // ===== META: Campaign-level insights with time_increment=1 =====
          if (!integration?.api_token) {
            errors.push(`Meta ${account.ad_account_id}: No API token`);
            continue;
          }

          const insightsUrl = `https://graph.facebook.com/v21.0/${account.ad_account_id}/insights?fields=campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,actions,action_values,date_start&time_range={"since":"${startDateStr}","until":"${endDateStr}"}&time_increment=1&level=campaign&limit=500&access_token=${integration.api_token}`;

          let allInsights: any[] = [];
          let nextUrl: string | null = insightsUrl;

          while (nextUrl) {
            const res = await fetch(nextUrl);
            const json = await res.json();
            if (json.error) { errors.push(`Meta ${account.ad_account_id}: ${json.error.message}`); break; }
            if (json.data?.length > 0) allInsights = allInsights.concat(json.data);
            nextUrl = json.paging?.next || null;
          }

          for (const row of allInsights) {
            const spend = parseFloat(row.spend || "0");
            const impressions = parseInt(row.impressions || "0", 10);
            const clicks = parseInt(row.clicks || "0", 10);
            const ctr = parseFloat(row.ctr || "0");
            const cpc = parseFloat(row.cpc || "0");
            const campaignId = row.campaign_id || `meta_unknown_${Date.now()}`;
            const campaignName = row.campaign_name || "Unknown Campaign";
            const date = row.date_start; // API's actual date

            // Extract results and conversion_value from actions
            let results = 0;
            let conversionValue = 0;
            if (row.actions) {
              for (const action of row.actions) {
                if (["offsite_conversion", "lead", "purchase", "complete_registration"].includes(action.action_type)) {
                  results += parseInt(action.value || "0", 10);
                }
              }
            }
            if (row.action_values) {
              for (const av of row.action_values) {
                if (av.action_type === "offsite_conversion.fb_pixel_purchase") {
                  conversionValue += parseFloat(av.value || "0");
                }
              }
            }

            const roas = spend > 0 ? Math.round((conversionValue / spend) * 100) / 100 : 0;
            const clientId = campaignClientMap[campaignId] || account.client_id;

            const { error } = await supabase.from("campaign_performance").upsert(
              {
                campaign_id: campaignId,
                campaign_name: campaignName,
                ad_account_id: account.id,
                client_id: clientId,
                date,
                impressions,
                clicks,
                ctr,
                cpc,
                spend,
                results,
                conversion_value: conversionValue,
                roas,
                status: "active",
                synced_at: new Date().toISOString(),
              },
              { onConflict: "campaign_id,date", ignoreDuplicates: false }
            );

            if (error) errors.push(`Meta campaign upsert: ${error.message}`);
          }

          console.log(`Meta deep-dive: ${allInsights.length} rows for ${account.ad_account_id}`);

        } else if (platform === "google") {
          // ===== GOOGLE: Campaign metrics with segments.date =====
          if (!integration?.api_token) {
            errors.push(`Google ${account.ad_account_id}: No API token`);
            continue;
          }

          const customerId = account.ad_account_id.replace(/-/g, "");
          const gaqlQuery = `SELECT campaign.id, campaign.name, campaign.status, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${startDateStr}' AND '${endDateStr}'`;

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
          for (const row of results) {
            const costMicros = parseInt(row.metrics?.costMicros || "0", 10);
            const spend = costMicros / 1_000_000;
            const impressions = parseInt(row.metrics?.impressions || "0", 10);
            const clicks = parseInt(row.metrics?.clicks || "0", 10);
            const ctr = parseFloat(row.metrics?.ctr || "0") * 100;
            const cpc = parseInt(row.metrics?.averageCpc || "0", 10) / 1_000_000;
            const conversions = parseFloat(row.metrics?.conversions || "0");
            const conversionValue = parseFloat(row.metrics?.conversionsValue || "0");
            const campaignId = `google_${row.campaign?.id}`;
            const date = row.segments?.date;
            const roas = spend > 0 ? Math.round((conversionValue / spend) * 100) / 100 : 0;
            const clientId = campaignClientMap[campaignId] || account.client_id;

            const statusMap: Record<string, string> = { ENABLED: "active", PAUSED: "paused", REMOVED: "removed" };

            const { error } = await supabase.from("campaign_performance").upsert(
              {
                campaign_id: campaignId,
                campaign_name: row.campaign?.name || "Google Campaign",
                ad_account_id: account.id,
                client_id: clientId,
                date,
                impressions,
                clicks,
                ctr,
                cpc,
                spend,
                results: Math.round(conversions),
                conversion_value: conversionValue,
                roas,
                status: statusMap[row.campaign?.status] || "active",
                synced_at: new Date().toISOString(),
              },
              { onConflict: "campaign_id,date", ignoreDuplicates: false }
            );

            if (error) errors.push(`Google campaign upsert: ${error.message}`);
          }

          console.log(`Google deep-dive: ${results.length} rows for ${account.ad_account_id}`);

        } else if (platform === "tiktok") {
          // ===== TIKTOK: Campaign metrics with stat_time_day =====
          if (!integration?.api_token) {
            errors.push(`TikTok ${account.ad_account_id}: No API token`);
            continue;
          }

          const params = new URLSearchParams({
            advertiser_id: account.ad_account_id,
            report_type: "BASIC",
            data_level: "AUCTION_CAMPAIGN",
            dimensions: '["campaign_id","stat_time_day"]',
            metrics: '["campaign_name","spend","impressions","clicks","ctr","cpc","conversion","conversion_cost","complete_payment_roas"]',
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
          for (const row of rows) {
            const spend = parseFloat(row.metrics?.spend || "0");
            const impressions = parseInt(row.metrics?.impressions || "0", 10);
            const clicks = parseInt(row.metrics?.clicks || "0", 10);
            const ctr = parseFloat(row.metrics?.ctr || "0") * 100;
            const cpc = parseFloat(row.metrics?.cpc || "0");
            const conversions = parseInt(row.metrics?.conversion || "0", 10);
            const roas = parseFloat(row.metrics?.complete_payment_roas || "0");
            const campaignId = `tiktok_${row.dimensions?.campaign_id}`;
            const campaignName = row.metrics?.campaign_name || `TikTok Campaign ${row.dimensions?.campaign_id}`;
            const date = (row.dimensions?.stat_time_day || "").split(" ")[0];
            const clientId = campaignClientMap[campaignId] || account.client_id;

            const { error } = await supabase.from("campaign_performance").upsert(
              {
                campaign_id: campaignId,
                campaign_name: campaignName,
                ad_account_id: account.id,
                client_id: clientId,
                date,
                impressions,
                clicks,
                ctr,
                cpc,
                spend,
                results: conversions,
                conversion_value: 0,
                roas,
                status: "active",
                synced_at: new Date().toISOString(),
              },
              { onConflict: "campaign_id,date", ignoreDuplicates: false }
            );

            if (error) errors.push(`TikTok campaign upsert: ${error.message}`);
          }

          console.log(`TikTok deep-dive: ${rows.length} rows for ${account.ad_account_id}`);
        }

        totalSynced++;
      } catch (err: any) {
        errors.push(`${platform} ${account.ad_account_id}: ${err.message}`);
      }
    }

    // Update last_synced_at
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
        message: "Deep dive sync complete",
        accounts_synced: totalSynced,
        errors: errors.length > 0 ? errors : undefined,
        date_range: { from: startDateStr, to: endDateStr },
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("sync-deep-dive error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
