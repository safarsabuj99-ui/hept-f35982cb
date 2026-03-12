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

/** Fetch TikTok API with retry on 41000 geo-restriction errors */
async function tiktokFetchWithRetry(url: string, headers: Record<string, string>, maxRetries = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (json.code === 41000 && attempt < maxRetries) {
      console.warn(`TikTok 41000 geo-restriction on attempt ${attempt}/${maxRetries}, retrying in 2s...`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    return json;
  }
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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse optional platform filter from request body
    let body: any = {};
    try { body = await req.json(); } catch {}
    const platformFilter: string | null = body?.platform || null;
    if (platformFilter) console.log(`Platform filter active: ${platformFilter}`);

    // ===== MAPPING-FIRST: Only get accounts with client mappings AND keywords =====
    const { data: mappedAssignments } = await supabase
      .from("ad_account_clients")
      .select("ad_account_id, client_id, mapping_keyword")
      .neq("mapping_keyword", "");

    if (!mappedAssignments || mappedAssignments.length === 0) {
      return new Response(
        JSON.stringify({ message: "No mapped accounts with keywords to sync", accounts_synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Get active ad accounts with integration tokens - ONLY MAPPED ACCOUNTS
    let accountsQuery = supabase
      .from("ad_accounts")
      .select("id, ad_account_id, platform_name, client_id, api_integration_id, account_currency, exchange_rate, api_integrations!ad_accounts_api_integration_id_fkey(api_token, app_id, platform)")
      .eq("is_active", true)
      .in("id", mappedAccountIds);

    if (platformFilter) {
      accountsQuery = accountsQuery.eq("platform_name", platformFilter);
    }

    const { data: accounts, error: accErr } = await accountsQuery;

    if (accErr) throw accErr;
    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active mapped accounts", accounts_synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read global sync start date
    const { data: dateSetting } = await supabase
      .from("settings").select("value").eq("key", "sync_start_date").maybeSingle();
    const globalStartDate = dateSetting?.value || "2025-01-01";
    // Use Asia/Dhaka timezone for "today"
    const endDateStr = getDhakaToday();

    // Load client profiles for per-client start dates
    const allClientIds = [...new Set(mappedAssignments.map(r => r.client_id))];
    const clientConfigs: Record<string, { start_date: string | null; timezone: string }> = {};

    if (allClientIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, data_fetch_start_date, preferred_timezone")
        .in("user_id", allClientIds);

      for (const p of profiles ?? []) {
        clientConfigs[p.user_id] = {
          start_date: p.data_fetch_start_date,
          timezone: p.preferred_timezone || "Asia/Dhaka",
        };
      }
    }

    // Get global exchange rate setting (fallback for BDT accounts without per-account rate)
    const { data: rateSetting } = await supabase
      .from("settings").select("value").eq("key", "exchange_rate").maybeSingle();
    const globalExchangeRate = rateSetting?.value ? Number(rateSetting.value) : 120;

    // Also load campaign mappings for legacy client_id resolution
    const { data: campaignMappings } = await supabase
      .from("campaign_mappings")
      .select("campaign_id, client_id")
      .eq("is_active", true);

    const campaignClientMap: Record<string, string | null> = {};
    for (const m of campaignMappings ?? []) {
      campaignClientMap[m.campaign_id] = m.client_id;
    }

    let totalSynced = 0;
    let skippedCampaigns = 0;
    const errors: string[] = [];

    // Get TikTok proxy URL setting
    const { data: proxySetting } = await supabase
      .from("settings").select("value").eq("key", "tiktok_proxy_url").maybeSingle();
    const tiktokProxyUrl = proxySetting?.value || null;
    const tiktokBase = getTikTokBaseUrl(tiktokProxyUrl);
    if (tiktokProxyUrl) console.log(`Using TikTok proxy: ${tiktokProxyUrl}`);

    for (const account of accounts) {
      const integration = (account as any).api_integrations;
      const platform = account.platform_name;
      const accountAssignments = accountKeywordMap[account.id] ?? [];

      try {
        // Determine per-account start date from linked clients
        const linkedClientIds = accountAssignments.map(a => a.client_id);
        let effectiveStartDate = globalStartDate;

        const clientDates = linkedClientIds
          .map(cid => clientConfigs[cid]?.start_date)
          .filter((d): d is string => !!d && d >= globalStartDate);

        if (clientDates.length > 0) {
          clientDates.sort();
          effectiveStartDate = clientDates[0]; // earliest
        }

        const startDateStr = effectiveStartDate;

        // Helper: resolve client_id for a campaign name using keyword matching
        const resolveClientId = (campaignName: string, rawCampaignId: string): string | null => {
          const nameLower = campaignName.toLowerCase();
          for (const { client_id, keyword } of accountAssignments) {
            if (nameLower.includes(keyword)) return client_id;
          }
          // Fallback to legacy campaign mappings
          if (campaignClientMap[rawCampaignId]) return campaignClientMap[rawCampaignId];
          return null; // NO MATCH = return null
        };

        // Helper: convert BDT spend to USD using per-account or global rate
        const isBDT = (account as any).account_currency === "BDT";
        const bdtRate = isBDT ? ((account as any).exchange_rate ?? globalExchangeRate) : 1;
        const convertSpend = (rawSpend: number): number => {
          if (!isBDT) return rawSpend;
          return Math.round((rawSpend / bdtRate) * 100) / 100;
        };

        // Helper: upsert campaign into campaigns table (ID locking)
        // statusConfirmed: true = status came directly from platform API; false = fallback "active"
        const upsertCampaign = async (
          platformId: string,
          name: string,
          status: string,
          clientId: string | null,
          statusConfirmed: boolean = true,
          objective: string = ""
        ) => {
          // Try to find existing
          const { data: existing } = await supabase
            .from("campaigns")
            .select("id, original_name_tag, status")
            .eq("platform_id", platformId)
            .maybeSingle();

          if (existing) {
            // If status is NOT confirmed from platform API, preserve the existing DB status
            const finalStatus = statusConfirmed ? status : existing.status;
            const updatePayload: any = { name, status: finalStatus, client_id: clientId, updated_at: new Date().toISOString() };
            if (objective) updatePayload.objective = objective;
            await supabase
              .from("campaigns")
              .update(updatePayload)
              .eq("id", existing.id);
            return { id: existing.id, status: finalStatus };
          } else {
            // Insert new with original_name_tag = current name
            const { data: inserted, error: insErr } = await supabase
              .from("campaigns")
              .insert({
                platform_id: platformId,
                name,
                original_name_tag: name,
                platform,
                status,
                ad_account_id: account.id,
                client_id: clientId,
                objective: objective || "",
              })
              .select("id")
              .single();

            if (insErr) {
              // Could be a race condition, try select again
              const { data: retry } = await supabase
                .from("campaigns")
                .select("id, status")
                .eq("platform_id", platformId)
                .single();
              return retry ? { id: retry.id, status: retry.status } : null;
            }
            return inserted ? { id: inserted.id, status } : null;
          }
        };

        // Helper: upsert daily metrics
        const upsertMetrics = async (
          campaignDbId: string,
          dataDate: string,
          metrics: {
            spend: number;
            impressions: number;
            clicks: number;
            results: number;
            conversion_value: number;
            ctr: number;
            cpc: number;
            roas: number;
            view_content?: number;
            add_to_cart?: number;
            initiate_checkout?: number;
            purchase?: number;
            messaging_conversations?: number;
            cost_per_purchase?: number;
            cost_per_message?: number;
            cpm?: number;
            reach?: number;
            new_messaging_contacts?: number;
            create_order?: number;
          }
        ) => {
          const { error } = await supabase
            .from("daily_metrics")
            .upsert(
              {
                campaign_id: campaignDbId,
                data_date: dataDate,
                spend: metrics.spend,
                impressions: metrics.impressions,
                clicks: metrics.clicks,
                results: metrics.results,
                conversion_value: metrics.conversion_value,
                ctr: metrics.ctr,
                cpc: metrics.cpc,
                roas: metrics.roas,
                view_content: metrics.view_content ?? 0,
                add_to_cart: metrics.add_to_cart ?? 0,
                initiate_checkout: metrics.initiate_checkout ?? 0,
                purchase: metrics.purchase ?? 0,
                messaging_conversations: metrics.messaging_conversations ?? 0,
                cost_per_purchase: metrics.cost_per_purchase ?? 0,
                cost_per_message: metrics.cost_per_message ?? 0,
                cpm: metrics.cpm ?? 0,
                reach: metrics.reach ?? 0,
                new_messaging_contacts: metrics.new_messaging_contacts ?? 0,
                create_order: metrics.create_order ?? 0,
                synced_at: new Date().toISOString(),
              },
              { onConflict: "campaign_id,data_date", ignoreDuplicates: false }
            );
          if (error) errors.push(`Metrics upsert: ${error.message}`);
        };

        if (platform === "meta") {
          if (!integration?.api_token) {
            errors.push(`Meta ${account.ad_account_id}: No API token`);
            continue;
          }

          // Fetch real campaign statuses AND objectives from Meta
          const metaStatusMap: Record<string, string> = {};
          const metaObjectiveMap: Record<string, string> = {};
          try {
            let statusNextUrl: string | null = `https://graph.facebook.com/v21.0/${account.ad_account_id}/campaigns?fields=id,effective_status,objective&limit=500&access_token=${integration.api_token}`;
            while (statusNextUrl) {
              const statusRes = await fetch(statusNextUrl);
              const statusJson = await statusRes.json();
              if (statusJson.data) {
                for (const c of statusJson.data) {
                  const rawStatus = (c.effective_status || "").toUpperCase();
                  if (rawStatus === "ACTIVE") metaStatusMap[c.id] = "active";
                  else if (rawStatus === "PAUSED" || rawStatus === "CAMPAIGN_PAUSED" || rawStatus === "ADSET_PAUSED") metaStatusMap[c.id] = "paused";
                  else if (rawStatus === "NOT_DELIVERING") metaStatusMap[c.id] = "not delivering";
                  else if (rawStatus === "WITH_ISSUES") metaStatusMap[c.id] = "with issues";
                  else if (rawStatus === "IN_PROCESS") metaStatusMap[c.id] = "in process";
                  else if (rawStatus === "PENDING_REVIEW") metaStatusMap[c.id] = "pending review";
                  else if (rawStatus === "DISAPPROVED") metaStatusMap[c.id] = "disapproved";
                  else if (rawStatus === "ARCHIVED") metaStatusMap[c.id] = "archived";
                  else if (rawStatus === "DELETED") metaStatusMap[c.id] = "deleted";
                  else metaStatusMap[c.id] = rawStatus.toLowerCase().replace(/_/g, " ");

                  // Map Meta objective to simplified label
                  const rawObj = (c.objective || "").toUpperCase();
                  if (rawObj === "OUTCOME_SALES" || rawObj === "PRODUCT_CATALOG_SALES" || rawObj === "CONVERSIONS") {
                    metaObjectiveMap[c.id] = "sales";
                  } else if (rawObj === "MESSAGES") {
                    metaObjectiveMap[c.id] = "messages";
                  } else if (rawObj === "OUTCOME_TRAFFIC" || rawObj === "LINK_CLICKS") {
                    metaObjectiveMap[c.id] = "traffic";
                  } else if (rawObj === "OUTCOME_LEADS" || rawObj === "LEAD_GENERATION") {
                    metaObjectiveMap[c.id] = "leads";
                  } else if (rawObj === "OUTCOME_ENGAGEMENT" || rawObj === "POST_ENGAGEMENT" || rawObj === "PAGE_LIKES") {
                    metaObjectiveMap[c.id] = "engagement";
                  } else if (rawObj === "OUTCOME_AWARENESS" || rawObj === "BRAND_AWARENESS" || rawObj === "REACH") {
                    metaObjectiveMap[c.id] = "awareness";
                  } else if (rawObj === "VIDEO_VIEWS") {
                    metaObjectiveMap[c.id] = "video_views";
                  } else if (rawObj) {
                    metaObjectiveMap[c.id] = rawObj.toLowerCase().replace(/_/g, " ");
                  }
                }
              }
              statusNextUrl = statusJson.paging?.next || null;
            }
          } catch (e: any) {
            errors.push(`Meta status fetch: ${e.message}`);
          }

          const insightsUrl = `https://graph.facebook.com/v21.0/${account.ad_account_id}/insights?fields=campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,reach,actions,action_values,date_start&time_range={"since":"${startDateStr}","until":"${endDateStr}"}&time_increment=1&level=campaign&limit=500&access_token=${integration.api_token}`;

          let allInsights: any[] = [];
          let nextUrl: string | null = insightsUrl;

          while (nextUrl) {
            const res = await fetch(nextUrl);
            const json = await res.json();
            if (json.error) { errors.push(`Meta ${account.ad_account_id}: ${json.error.message}`); break; }
            if (json.data?.length > 0) allInsights = allInsights.concat(json.data);
            nextUrl = json.paging?.next || null;
          }

          let metaRowIndex = 0;
          for (const row of allInsights) {
            const spend = parseFloat(row.spend || "0");
            const impressions = parseInt(row.impressions || "0", 10);
            const reach = parseInt(row.reach || "0", 10);
            const clicks = parseInt(row.clicks || "0", 10);
            const ctr = parseFloat(row.ctr || "0");
            const cpc = parseFloat(row.cpc || "0");
            const rawCampaignId = row.campaign_id || `meta_unknown_${Date.now()}`;
            const campaignName = row.campaign_name || "Unknown Campaign";
            const dataDate = row.date_start; // API's actual date

            // ===== KEYWORD MATCHING: Skip if no match =====
            const clientId = resolveClientId(campaignName, rawCampaignId);
            if (!clientId) {
              skippedCampaigns++;
              continue;
            }

            // Extract results, conversion_value, and granular funnel actions
            let results = 0;
            let conversionValue = 0;
            let viewContent = 0;
            let addToCart = 0;
            let initiateCheckout = 0;
            let purchaseCount = 0;
            let messagingConversations = 0;
            let newMessagingContacts = 0;
            let createOrder = 0;

            if (row.actions) {
              for (const action of row.actions) {
                const at = action.action_type;
                const val = parseInt(action.value || "0", 10);
                // Generic results
                if (["offsite_conversion", "lead", "purchase", "complete_registration"].includes(at)) {
                  results += val;
                }
                // Granular funnel actions
                if (at === "offsite_conversion.fb_pixel_view_content") viewContent += val;
                if (at === "offsite_conversion.fb_pixel_add_to_cart") addToCart += val;
                if (at === "offsite_conversion.fb_pixel_initiate_checkout") initiateCheckout += val;
                if (at === "offsite_conversion.fb_pixel_purchase") purchaseCount += val;
                if (at === "onsite_conversion.messaging_conversation_started_7d") messagingConversations += val;
                if (at === "onsite_conversion.messaging_first_reply") newMessagingContacts += val;
                if (at === "onsite_conversion.messaging_block_create_order") createOrder += val;
              }
            }
            if (row.action_values) {
              for (const av of row.action_values) {
                if (av.action_type === "offsite_conversion.fb_pixel_purchase") {
                  conversionValue += parseFloat(av.value || "0");
                }
              }
            }

            const spendUsd = convertSpend(spend);
            const cpcUsd = convertSpend(cpc);
            const roas = spendUsd > 0 ? Math.round((conversionValue / spendUsd) * 100) / 100 : 0;
            const cpmValue = impressions > 0 ? (spendUsd / impressions) * 1000 : 0;
            const costPerPurchase = purchaseCount > 0 ? spendUsd / purchaseCount : 0;
            const costPerMessage = messagingConversations > 0 ? spendUsd / messagingConversations : 0;
            const platformId = `meta_${rawCampaignId}`;
            const objective = metaObjectiveMap[rawCampaignId] || "";

            // ID Locking: upsert into campaigns table
            const statusConfirmed = rawCampaignId in metaStatusMap;
            const metaCampaignStatus = metaStatusMap[rawCampaignId] || "active";
            const campaignResult = await upsertCampaign(platformId, campaignName, metaCampaignStatus, clientId, statusConfirmed, objective);
            if (!campaignResult) { errors.push(`Failed to upsert campaign ${platformId}`); continue; }
            const campaignDbId = campaignResult.id;
            const finalStatus = campaignResult.status;

            // Upsert daily metrics with funnel actions
            await upsertMetrics(campaignDbId, dataDate, {
              spend: spendUsd, impressions, clicks, results, conversion_value: conversionValue, ctr, cpc: cpcUsd, roas,
              view_content: viewContent,
              add_to_cart: addToCart,
              initiate_checkout: initiateCheckout,
              purchase: purchaseCount,
              messaging_conversations: messagingConversations,
              new_messaging_contacts: newMessagingContacts,
              create_order: createOrder,
              reach,
              cost_per_purchase: Math.round(costPerPurchase * 100) / 100,
              cost_per_message: Math.round(costPerMessage * 100) / 100,
              cpm: Math.round(cpmValue * 100) / 100,
            });

            // Also write to legacy campaign_performance for backward compatibility
            const { error } = await supabase.from("campaign_performance").upsert(
              {
                campaign_id: rawCampaignId,
                campaign_name: campaignName,
                ad_account_id: account.id,
                client_id: clientId,
                date: dataDate,
                impressions, clicks, ctr, cpc: cpcUsd, spend: spendUsd, results,
                conversion_value: conversionValue, roas,
                status: finalStatus,
                synced_at: new Date().toISOString(),
              },
              { onConflict: "campaign_id,date", ignoreDuplicates: false }
            );
            if (error) errors.push(`Meta legacy upsert: ${error.message}`);
          }

          console.log(`Meta deep-dive: ${allInsights.length} rows for ${account.ad_account_id}`);

        } else if (platform === "google") {
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

          const gResults = json[0]?.results || [];
          for (const row of gResults) {
            const costMicros = parseInt(row.metrics?.costMicros || "0", 10);
            const spend = costMicros / 1_000_000;
            const impressions = parseInt(row.metrics?.impressions || "0", 10);
            const clicks = parseInt(row.metrics?.clicks || "0", 10);
            const ctr = parseFloat(row.metrics?.ctr || "0") * 100;
            const cpc = parseInt(row.metrics?.averageCpc || "0", 10) / 1_000_000;
            const conversions = parseFloat(row.metrics?.conversions || "0");
            const conversionValue = parseFloat(row.metrics?.conversionsValue || "0");
            const rawCampaignId = row.campaign?.id;
            const campaignName = row.campaign?.name || "Google Campaign";
            const dataDate = row.segments?.date;
            const spendUsd = convertSpend(spend);
            const cpcUsd = convertSpend(cpc);
            const roas = spendUsd > 0 ? Math.round((conversionValue / spendUsd) * 100) / 100 : 0;

            // ===== KEYWORD MATCHING: Skip if no match =====
            const platformId = `google_${rawCampaignId}`;
            const clientId = resolveClientId(campaignName, platformId);
            if (!clientId) {
              skippedCampaigns++;
              continue;
            }

            const statusMap: Record<string, string> = { ENABLED: "active", PAUSED: "paused", REMOVED: "removed" };
            const googleStatusConfirmed = !!row.campaign?.status;
            const status = statusMap[row.campaign?.status] || "active";

            const campaignResult = await upsertCampaign(platformId, campaignName, status, clientId, googleStatusConfirmed);
            if (!campaignResult) { errors.push(`Failed to upsert campaign ${platformId}`); continue; }
            const campaignDbId = campaignResult.id;
            const finalStatus = campaignResult.status;

            await upsertMetrics(campaignDbId, dataDate, {
              spend: spendUsd, impressions, clicks, results: Math.round(conversions),
              conversion_value: conversionValue, ctr, cpc: cpcUsd, roas,
            });

            // Legacy write
            const { error } = await supabase.from("campaign_performance").upsert(
              {
                campaign_id: platformId,
                campaign_name: campaignName,
                ad_account_id: account.id,
                client_id: clientId,
                date: dataDate, impressions, clicks, ctr, cpc: cpcUsd, spend: spendUsd,
                results: Math.round(conversions), conversion_value: conversionValue,
                roas, status: finalStatus,
                synced_at: new Date().toISOString(),
              },
              { onConflict: "campaign_id,date", ignoreDuplicates: false }
            );
            if (error) errors.push(`Google legacy upsert: ${error.message}`);
          }

          console.log(`Google deep-dive: ${gResults.length} rows for ${account.ad_account_id}`);

        } else if (platform === "tiktok") {
          if (!integration?.api_token) {
            errors.push(`TikTok ${account.ad_account_id}: No API token`);
            continue;
          }

          const bcId = integration.app_id || "";
          let json: any = null;

          // Split into 30-day chunks for TikTok API compatibility
          const dateChunks = generateDateChunks(startDateStr, endDateStr);
          console.log(`TikTok ${account.ad_account_id}: ${dateChunks.length} chunk(s) [${startDateStr}→${endDateStr}], base=${tiktokBase}`);
          let allTiktokRows: any[] = [];
          let tiktokFailed = false;

          for (const chunk of dateChunks) {
            let cJson: any = null;

            if (bcId) {
              const bcParams = new URLSearchParams({
                bc_id: bcId,
                advertiser_ids: JSON.stringify([account.ad_account_id]),
                service_type: "AUCTION",
                report_type: "BASIC",
                data_level: "AUCTION_CAMPAIGN",
                dimensions: '["campaign_id","stat_time_day"]',
                metrics: '["campaign_name","spend","impressions","clicks","ctr","cpc","conversion","conversion_cost","complete_payment_roas"]',
                start_date: chunk.start,
                end_date: chunk.end,
                page_size: "500",
              });

              const bcRes = await tiktokFetchWithRetry(
                `${tiktokBase}/open_api/v1.3/report/integrated/get/?${bcParams}`,
                { "Access-Token": integration.api_token, "Content-Type": "application/json" }
              );

              cJson = bcRes;
              if (cJson.code !== 0) {
                console.warn(`TikTok BC chunk ${chunk.start}-${chunk.end} failed: [${cJson.code}] ${cJson.message}. Falling back.`);
                cJson = null;
              }
            }

            if (!cJson) {
              const params = new URLSearchParams({
                advertiser_id: account.ad_account_id,
                report_type: "BASIC",
                data_level: "AUCTION_CAMPAIGN",
                dimensions: '["campaign_id","stat_time_day"]',
                metrics: '["campaign_name","spend","impressions","clicks","ctr","cpc","conversion","conversion_cost","complete_payment_roas"]',
                start_date: chunk.start,
                end_date: chunk.end,
                page_size: "500",
              });

              const directRes = await tiktokFetchWithRetry(
                `${tiktokBase}/open_api/v1.3/report/integrated/get/?${params}`,
                { "Access-Token": integration.api_token, "Content-Type": "application/json" }
              );

              cJson = directRes;
              if (cJson.code !== 0) {
                console.error(`TikTok chunk ${chunk.start}-${chunk.end} error:`, JSON.stringify(cJson));
                errors.push(`TikTok ${account.ad_account_id}: [code ${cJson.code}] ${cJson.message}`);
                tiktokFailed = true;
                break;
              }
            }

            allTiktokRows = allTiktokRows.concat(cJson.data?.list || []);
            console.log(`TikTok chunk ${chunk.start}-${chunk.end}: ${(cJson.data?.list || []).length} rows`);
          }

          if (tiktokFailed) continue;
          json = { data: { list: allTiktokRows } };

          // Fetch real campaign statuses from TikTok
          const tiktokStatusMap: Record<string, string> = {};
          let tiktokStatusFetchFailed = false;
          try {
            const statusParams = new URLSearchParams({
              advertiser_id: account.ad_account_id,
              page_size: "500",
            });
            const statusRes = await tiktokFetchWithRetry(
              `${tiktokBase}/open_api/v1.3/campaign/get/?${statusParams}`,
              { "Access-Token": integration.api_token, "Content-Type": "application/json" }
            );
            const statusJson = statusRes;
            console.log(`TikTok status fetch response code: ${statusJson.code}, campaigns found: ${statusJson.data?.list?.length ?? 0}`);
            if (statusJson.code === 0 && statusJson.data?.list) {
              for (const c of statusJson.data.list) {
                const opStatus = (c.operation_status || "").toUpperCase();
                const secStatus = (c.secondary_status || "").toUpperCase();
                console.log(`TikTok campaign ${c.campaign_id}: operation_status=${opStatus}, secondary_status=${secStatus}`);

                const activeStatuses = [
                  "CAMPAIGN_STATUS_ENABLE",
                  "CAMPAIGN_STATUS_ADVERTISER_BUDGET_FULL",
                  "CAMPAIGN_STATUS_ALL_ADGROUP_PAUSED",
                  "CAMPAIGN_STATUS_BUDGET_EXCEED",
                  "CAMPAIGN_STATUS_NOT_START",
                ];
                const deletedStatuses = ["CAMPAIGN_STATUS_DELETE"];

                if (deletedStatuses.includes(opStatus)) {
                  tiktokStatusMap[c.campaign_id] = "deleted";
                } else if (opStatus === "CAMPAIGN_STATUS_DISABLE") {
                  tiktokStatusMap[c.campaign_id] = "paused";
                } else if (activeStatuses.includes(opStatus)) {
                  if (secStatus.includes("ALL_ADGROUP_PAUSED") || opStatus === "CAMPAIGN_STATUS_ALL_ADGROUP_PAUSED") {
                    tiktokStatusMap[c.campaign_id] = "active - ad groups paused";
                  } else if (secStatus.includes("BUDGET_EXCEED") || opStatus === "CAMPAIGN_STATUS_BUDGET_EXCEED") {
                    tiktokStatusMap[c.campaign_id] = "active - budget exceeded";
                  } else if (secStatus.includes("NOT_START") || opStatus === "CAMPAIGN_STATUS_NOT_START") {
                    tiktokStatusMap[c.campaign_id] = "active - not started";
                  } else {
                    tiktokStatusMap[c.campaign_id] = "active";
                  }
                } else {
                  tiktokStatusMap[c.campaign_id] = opStatus.toLowerCase().replace(/campaign_status_/g, "").replace(/_/g, " ");
                }
              }
            } else {
              // API returned non-zero code or no data — treat as failed
              console.warn(`TikTok status fetch failed with code ${statusJson.code}: ${statusJson.message || 'unknown error'}`);
              tiktokStatusFetchFailed = true;
            }
          } catch (e: any) {
            console.error(`TikTok status fetch exception: ${e.message}`);
            errors.push(`TikTok status fetch: ${e.message}`);
            tiktokStatusFetchFailed = true;
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
            const rawCampaignId = row.dimensions?.campaign_id;
            const campaignName = row.metrics?.campaign_name || `TikTok Campaign ${rawCampaignId}`;
            const dataDate = (row.dimensions?.stat_time_day || "").split(" ")[0];

            // ===== KEYWORD MATCHING: Skip if no match =====
            const platformId = `tiktok_${rawCampaignId}`;
            const clientId = resolveClientId(campaignName, platformId);
            if (!clientId) {
              skippedCampaigns++;
              continue;
            }

            // If status fetch failed and map is empty, force "active" to overwrite stale "paused"
            // If status fetch succeeded, use the map (confirmed) or default "active" (also confirmed since API worked)
            const tiktokStatusConfirmed = tiktokStatusFetchFailed ? true : true; // Always confirmed — either from API or forced active
            const tiktokCampaignStatus = tiktokStatusMap[rawCampaignId] || "active";
            const campaignResult = await upsertCampaign(platformId, campaignName, tiktokCampaignStatus, clientId, tiktokStatusConfirmed);
            if (!campaignResult) { errors.push(`Failed to upsert campaign ${platformId}`); continue; }
            const campaignDbId = campaignResult.id;
            const finalTiktokStatus = campaignResult.status;

            const spendUsd = convertSpend(spend);
            const cpcUsd = convertSpend(cpc);

            await upsertMetrics(campaignDbId, dataDate, {
              spend: spendUsd, impressions, clicks, results: conversions,
              conversion_value: 0, ctr, cpc: cpcUsd, roas,
            });

            // Legacy write
            const { error } = await supabase.from("campaign_performance").upsert(
              {
                campaign_id: platformId,
                campaign_name: campaignName,
                ad_account_id: account.id,
                client_id: clientId,
                date: dataDate, impressions, clicks, ctr, cpc: cpcUsd, spend: spendUsd,
                results: conversions, conversion_value: 0, roas,
                status: finalTiktokStatus,
                synced_at: new Date().toISOString(),
              },
              { onConflict: "campaign_id,date", ignoreDuplicates: false }
            );
            if (error) errors.push(`TikTok legacy upsert: ${error.message}`);
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
        skipped_no_keyword_match: skippedCampaigns,
        errors: errors.length > 0 ? errors : undefined,
        date_range: { from: globalStartDate, to: endDateStr },
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
