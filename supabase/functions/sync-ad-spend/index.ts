import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIKTOK_BASE_URL = "https://business-api.tiktok.com";

/** Get TikTok API base URL - uses proxy if configured to bypass geo-restrictions */
function getTikTokBaseUrl(proxyUrl: string | null): string {
  if (proxyUrl) {
    return proxyUrl.replace(/\/+$/, "");
  }
  return TIKTOK_BASE_URL;
}

/** Split a date range into 30-day chunks for TikTok API compatibility */
function generateDateChunks(startDate: string, endDate: string, maxDays = 30): Array<{start: string, end: string}> {
  const chunks: Array<{start: string, end: string}> = [];
  let current = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  while (current <= end) {
    const chunkEnd = new Date(current);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({
      start: current.toISOString().split("T")[0],
      end: chunkEnd.toISOString().split("T")[0],
    });
    current = new Date(chunkEnd);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return chunks;
}

/** Get today's date string in Asia/Dhaka timezone */
function getDhakaToday(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Dhaka" }).split(" ")[0];
}

// Force redeploy v2 - proxy + 30-day chunking fix

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

    // ===== MAPPING-FIRST: Only get accounts with client mappings AND keywords =====
    const { data: mappedAssignments } = await supabaseAdmin
      .from("ad_account_clients")
      .select("ad_account_id, client_id, mapping_keyword")
      .neq("mapping_keyword", "");

    if (!mappedAssignments || mappedAssignments.length === 0) {
      return new Response(JSON.stringify({ 
        message: "No mapped accounts with keywords to sync", 
        synced: 0 
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mappedAccountIds = [...new Set(mappedAssignments.map(r => r.ad_account_id))];

    // Build a map: ad_account_id -> [{ client_id, keyword }]
    const accountKeywordMap: Record<string, { client_id: string; keyword: string }[]> = {};
    for (const ac of mappedAssignments) {
      if (!accountKeywordMap[ac.ad_account_id]) accountKeywordMap[ac.ad_account_id] = [];
      accountKeywordMap[ac.ad_account_id].push({
        client_id: ac.client_id,
        keyword: ac.mapping_keyword.trim().toLowerCase(),
      });
    }

    // Get active ad accounts with their integration tokens - ONLY MAPPED ACCOUNTS
    const { data: adAccounts } = await supabaseAdmin
      .from("ad_accounts")
      .select("*, api_integrations!ad_accounts_api_integration_id_fkey(api_token, app_id, platform)")
      .eq("is_active", true)
      .in("id", mappedAccountIds);

    if (!adAccounts || adAccounts.length === 0) {
      return new Response(JSON.stringify({ error: "No active mapped ad accounts found." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get client profiles for custom rates
    const allClientIds = [...new Set(mappedAssignments.map(r => r.client_id))];
    const { data: clientProfiles } = await supabaseAdmin
      .from("profiles").select("user_id, custom_exchange_rate, pricing_config")
      .in("user_id", allClientIds);

    const clientRates: Record<string, number | null> = {};
    for (const p of clientProfiles ?? []) {
      if (p.custom_exchange_rate) {
        clientRates[p.user_id] = Number(p.custom_exchange_rate);
      }
    }

    // Read configurable sync start date from settings
    const { data: dateSetting } = await supabaseAdmin
      .from("settings").select("value").eq("key", "sync_start_date").maybeSingle();
    const sinceStr = dateSetting?.value || "2025-01-01";
    // Use Asia/Dhaka timezone for "today"
    const untilStr = getDhakaToday();

    console.log(`Syncing spend from ${sinceStr} to ${untilStr} for ${adAccounts.length} mapped accounts`);

    // Get TikTok proxy URL setting
    const { data: proxySetting } = await supabaseAdmin
      .from("settings").select("value").eq("key", "tiktok_proxy_url").maybeSingle();
    const tiktokProxyUrl = proxySetting?.value || null;
    const tiktokBase = getTikTokBaseUrl(tiktokProxyUrl);
    if (tiktokProxyUrl) console.log(`Using TikTok proxy: ${tiktokProxyUrl}`);

    let totalRecords = 0;
    let autoMapped = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Group accounts by platform
    const metaAccounts = adAccounts.filter((a: any) => a.platform_name === "meta");
    const googleAccounts = adAccounts.filter((a: any) => a.platform_name === "google");
    const tiktokAccounts = adAccounts.filter((a: any) => a.platform_name === "tiktok");

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

        const spendRecords: any[] = [];
        const campaignMappings: any[] = [];

        for (const row of allInsights) {
          const spend = parseFloat(row.spend || "0");
          if (spend <= 0) continue;

          const date = row.date_start; // Use API's date, NOT new Date()
          const campaignName = row.campaign_name || "Unknown Campaign";
          const campaignId = row.campaign_id || `meta_${Date.now()}`;

          const isBDT = account.account_currency === "BDT";

          // ===== KEYWORD MATCHING: Skip if no match =====
          const nameLower = campaignName.toLowerCase();
          let matchedClientId: string | null = null;
          for (const { client_id, keyword } of accountAssignments) {
            if (nameLower.includes(keyword)) { 
              matchedClientId = client_id; 
              break; 
            }
          }

          // NO MATCH = DO NOT COLLECT
          if (!matchedClientId) {
            skipped++;
            continue;
          }

          let effectiveRate = exchangeRate;
          if (clientRates[matchedClientId]) {
            effectiveRate = clientRates[matchedClientId]!;
          }

          const finalBillableUsd = isBDT
            ? Math.round((spend / effectiveRate) * 100) / 100
            : spend;

          spendRecords.push({
            ad_account_id: account.id,
            date,
            campaign_name: campaignName,
            raw_spend_amount: spend,
            raw_currency: account.account_currency,
            exchange_rate_used: isBDT ? effectiveRate : 1,
            final_billable_usd: finalBillableUsd,
            synced_at: new Date().toISOString(),
          });

          campaignMappings.push({
            campaign_id: campaignId,
            campaign_name: campaignName,
            platform: "meta",
            ad_account_id: account.id,
            client_id: matchedClientId,
            is_active: true,
          });

          autoMapped++;
        }

        // Upsert spend in batches of 100 — unique constraint handles duplicates & corrections
        for (let i = 0; i < spendRecords.length; i += 100) {
          const batch = spendRecords.slice(i, i + 100);
          const { error: upsertError } = await supabaseAdmin
            .from("daily_ad_spend")
            .upsert(batch, { onConflict: "ad_account_id,date,campaign_name", ignoreDuplicates: false });
          if (upsertError) errors.push(`${adAccountId} upsert error: ${upsertError.message}`);
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

        totalRecords += spendRecords.length;
      } catch (err: any) {
        errors.push(`${adAccountId}: ${err.message}`);
      }
    }

    // ===== GOOGLE: Fetch real spend via Google Ads REST API =====
    for (const account of googleAccounts) {
      const integration = account.api_integrations as any;
      if (!integration?.api_token) {
        errors.push(`${account.ad_account_id}: No API token (Google)`);
        continue;
      }

      const accountAssignments = accountKeywordMap[account.id] ?? [];

      try {
        const customerId = account.ad_account_id.replace(/-/g, "");
        const developerToken = integration.app_id || "";
        const accessToken = integration.api_token;

        const gaqlQuery = `SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks FROM campaign WHERE segments.date BETWEEN '${sinceStr}' AND '${untilStr}'`;

        const res = await fetch(
          `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:searchStream`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "developer-token": developerToken,
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

          const date = row.segments?.date; // YYYY-MM-DD from API
          const campaignName = row.campaign?.name || "Unknown Campaign";

          // ===== KEYWORD MATCHING: Skip if no match =====
          const nameLower = campaignName.toLowerCase();
          let matchedClientId: string | null = null;
          for (const { client_id, keyword } of accountAssignments) {
            if (nameLower.includes(keyword)) { 
              matchedClientId = client_id; 
              break; 
            }
          }

          if (!matchedClientId) {
            skipped++;
            continue;
          }

          spendRecords.push({
            ad_account_id: account.id,
            date,
            campaign_name: campaignName,
            raw_spend_amount: spend,
            raw_currency: account.account_currency,
            exchange_rate_used: 1,
            final_billable_usd: spend,
            synced_at: new Date().toISOString(),
          });

          autoMapped++;
        }

        for (let i = 0; i < spendRecords.length; i += 100) {
          const batch = spendRecords.slice(i, i + 100);
          const { error: upsertError } = await supabaseAdmin
            .from("daily_ad_spend")
            .upsert(batch, { onConflict: "ad_account_id,date,campaign_name", ignoreDuplicates: false });
          if (upsertError) errors.push(`Google ${account.ad_account_id} upsert: ${upsertError.message}`);
        }

        totalRecords += spendRecords.length;
        console.log(`Google: ${spendRecords.length} rows for ${account.account_name}`);
      } catch (err: any) {
        errors.push(`Google ${account.ad_account_id}: ${err.message}`);
      }
    }

    // ===== TIKTOK: Fetch real spend via TikTok Marketing API (BC-scoped) =====
    for (const account of tiktokAccounts) {
      const integration = account.api_integrations as any;
      if (!integration?.api_token) {
        errors.push(`${account.ad_account_id}: No API token (TikTok)`);
        continue;
      }

      const accountAssignments = accountKeywordMap[account.id] ?? [];

      try {
        const advertiserId = account.ad_account_id;
        const accessToken = integration.api_token;
        const bcId = integration.app_id || "";
        let json: any = null;

        // Try BC-scoped reporting first (bypasses geo-restriction error 41000)
        if (bcId) {
          const bcParams = new URLSearchParams({
            bc_id: bcId,
            advertiser_ids: JSON.stringify([advertiserId]),
            service_type: "AUCTION",
            report_type: "BASIC",
            data_level: "AUCTION_CAMPAIGN",
            dimensions: '["campaign_id","stat_time_day"]',
            metrics: '["campaign_name","spend","impressions","clicks"]',
            start_date: sinceStr,
            end_date: untilStr,
            page_size: "500",
          });

          const bcRes = await fetch(
            `${tiktokBase}/open_api/v1.3/report/integrated/get/?${bcParams}`,
            {
              headers: {
                "Access-Token": accessToken,
                "Content-Type": "application/json",
              },
            }
          );

          json = await bcRes.json();
          if (json.code !== 0) {
            console.warn(`TikTok BC-scoped report failed for ${advertiserId}: [code ${json.code}] ${json.message}. Falling back.`);
            json = null;
          } else {
            console.log(`TikTok BC-scoped report succeeded for ${advertiserId}`);
          }
        }

        // Fallback: standard advertiser-scoped reporting
        if (!json) {
          const params = new URLSearchParams({
            advertiser_id: advertiserId,
            report_type: "BASIC",
            data_level: "AUCTION_CAMPAIGN",
            dimensions: '["campaign_id","stat_time_day"]',
            metrics: '["campaign_name","spend","impressions","clicks"]',
            start_date: sinceStr,
            end_date: untilStr,
            page_size: "500",
          });

          const res = await fetch(
            `${tiktokBase}/open_api/v1.3/report/integrated/get/?${params}`,
            {
              headers: {
                "Access-Token": accessToken,
                "Content-Type": "application/json",
              },
            }
          );

          json = await res.json();
          if (json.code !== 0) {
            console.error(`TikTok API error for ${advertiserId}:`, JSON.stringify(json));
            errors.push(`TikTok ${advertiserId}: [code ${json.code}] ${json.message}`);
            continue;
          }
        }

        const rows = json.data?.list || [];
        const spendRecords: any[] = [];

        for (const row of rows) {
          const spend = parseFloat(row.metrics?.spend || "0");
          if (spend <= 0) continue;

          const date = (row.dimensions?.stat_time_day || "").split(" ")[0]; // "2025-02-14 00:00:00" -> "2025-02-14"
          const campaignName = row.metrics?.campaign_name || `Campaign ${row.dimensions?.campaign_id}`;

          // ===== KEYWORD MATCHING: Skip if no match =====
          const nameLower = campaignName.toLowerCase();
          let matchedClientId: string | null = null;
          for (const { client_id, keyword } of accountAssignments) {
            if (nameLower.includes(keyword)) { 
              matchedClientId = client_id; 
              break; 
            }
          }

          if (!matchedClientId) {
            skipped++;
            continue;
          }

          spendRecords.push({
            ad_account_id: account.id,
            date,
            campaign_name: campaignName,
            raw_spend_amount: spend,
            raw_currency: account.account_currency,
            exchange_rate_used: 1,
            final_billable_usd: spend,
            synced_at: new Date().toISOString(),
          });

          autoMapped++;
        }

        for (let i = 0; i < spendRecords.length; i += 100) {
          const batch = spendRecords.slice(i, i + 100);
          const { error: upsertError } = await supabaseAdmin
            .from("daily_ad_spend")
            .upsert(batch, { onConflict: "ad_account_id,date,campaign_name", ignoreDuplicates: false });
          if (upsertError) errors.push(`TikTok ${advertiserId} upsert: ${upsertError.message}`);
        }

        totalRecords += spendRecords.length;
        console.log(`TikTok: ${spendRecords.length} rows for ${account.account_name}`);
      } catch (err: any) {
        errors.push(`TikTok ${account.ad_account_id}: ${err.message}`);
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
        records_upserted: totalRecords,
        exchange_rate_used: exchangeRate,
        mapped_campaigns: autoMapped,
        skipped_no_keyword_match: skipped,
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
