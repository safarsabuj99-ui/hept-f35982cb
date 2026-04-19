import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIKTOK_BASE_URL = "https://business-api.tiktok.com";

// Bulletproof sync limits
const MAX_PAGES_META = 50;
const MAX_PAGES_TIKTOK = 20;
const FLUSH_THRESHOLD = 2000;        // Flush bulk arrays when they reach this size
const BULK_UPSERT_CHUNK = 500;       // Upsert in 500-row sub-batches (Postgres-safe)
const RECONCILIATION_TOLERANCE = 0.10; // $0.10 drift tolerance before alerting

function getTikTokBaseUrl(proxyUrl: string | null): string {
  if (proxyUrl) return proxyUrl.replace(/\/+$/, "");
  return TIKTOK_BASE_URL;
}

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

function getDhakaToday(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Dhaka" }).split(" ")[0];
}

// Bulk-upsert helper: chunked, with onConflict, returns error count.
async function bulkUpsert(
  supabase: any,
  table: string,
  rows: any[],
  onConflict: string,
  errors: string[],
  label: string,
): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += BULK_UPSERT_CHUNK) {
    const slice = rows.slice(i, i + BULK_UPSERT_CHUNK);
    const { error } = await supabase.from(table).upsert(slice, { onConflict, ignoreDuplicates: false });
    if (error) {
      errors.push(`${label} bulk upsert (${slice.length} rows): ${error.message}`);
      console.error(`${label} bulk upsert error:`, error.message);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let body: any = {};
    try { body = await req.json(); } catch {}
    const platformFilter: string | null = body?.platform || null;
    const adAccountIdsFilter: string[] | null = body?.ad_account_ids || null;
    const dateFromOverride: string | null = body?.date_from || null;
    const dateToOverride: string | null = body?.date_to || null;
    if (platformFilter) console.log(`Platform filter active: ${platformFilter}`);
    if (adAccountIdsFilter) console.log(`Ad account IDs filter: ${adAccountIdsFilter.join(", ")}`);
    if (dateFromOverride && dateToOverride) console.log(`Chunk window: ${dateFromOverride} → ${dateToOverride}`);

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
    const accountKeywordMap: Record<string, { client_id: string; keyword: string }[]> = {};
    for (const ac of mappedAssignments) {
      if (!accountKeywordMap[ac.ad_account_id]) accountKeywordMap[ac.ad_account_id] = [];
      accountKeywordMap[ac.ad_account_id].push({
        client_id: ac.client_id,
        keyword: ac.mapping_keyword.trim().toLowerCase(),
      });
    }

    let accountsQuery = supabase
      .from("ad_accounts")
      .select("id, ad_account_id, platform_name, client_id, api_integration_id, account_currency, exchange_rate, account_name, org_id, api_integrations!ad_accounts_api_integration_id_fkey(api_token, app_id, platform)")
      .eq("is_active", true)
      .in("id", mappedAccountIds);

    if (adAccountIdsFilter && adAccountIdsFilter.length > 0) {
      accountsQuery = accountsQuery.in("id", adAccountIdsFilter);
    }
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

    const { data: dateSetting } = await supabase
      .from("settings").select("value").eq("key", "sync_start_date").maybeSingle();
    const globalStartDate = dateSetting?.value || "2025-01-01";
    const endDateStr = dateToOverride || getDhakaToday();

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

    const { data: rateSetting } = await supabase
      .from("settings").select("value").eq("key", "exchange_rate").maybeSingle();
    const globalExchangeRate = rateSetting?.value ? Number(rateSetting.value) : 120;

    const { data: campaignMappings } = await supabase
      .from("campaign_mappings")
      .select("campaign_id, client_id")
      .eq("is_active", true);

    const campaignClientMap: Record<string, string | null> = {};
    for (const m of campaignMappings ?? []) campaignClientMap[m.campaign_id] = m.client_id;

    let totalSynced = 0;
    let skippedCampaigns = 0;
    const errors: string[] = [];

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
        const linkedClientIds = accountAssignments.map(a => a.client_id);
        let effectiveStartDate = globalStartDate;
        const clientDates = linkedClientIds
          .map(cid => clientConfigs[cid]?.start_date)
          .filter((d): d is string => !!d && d >= globalStartDate);
        if (clientDates.length > 0) {
          clientDates.sort();
          effectiveStartDate = clientDates[0];
        }

        const startDateStr = dateFromOverride
          ? (dateFromOverride > effectiveStartDate ? dateFromOverride : effectiveStartDate)
          : effectiveStartDate;

        const resolveClientId = (campaignName: string, rawCampaignId: string): string | null => {
          const nameLower = campaignName.toLowerCase();
          for (const { client_id, keyword } of accountAssignments) {
            if (nameLower.includes(keyword)) return client_id;
          }
          if (campaignClientMap[rawCampaignId]) return campaignClientMap[rawCampaignId];
          return null;
        };

        const isBDT = (account as any).account_currency === "BDT";
        const bdtRate = isBDT ? ((account as any).exchange_rate ?? globalExchangeRate) : 1;
        const convertSpend = (rawSpend: number): number => {
          if (!isBDT) return rawSpend;
          return Math.round((rawSpend / bdtRate) * 100) / 100;
        };

        // Build guard-locked campaign ID set so we never overwrite Ad Guard pauses
        const guardLockedIds = new Set<string>();
        if (linkedClientIds.length > 0) {
          const { data: clientProfiles } = await supabase
            .from("profiles")
            .select("system_paused_campaigns")
            .in("user_id", linkedClientIds);
          for (const p of clientProfiles ?? []) {
            const paused = p.system_paused_campaigns;
            if (Array.isArray(paused)) {
              for (const id of paused) guardLockedIds.add(String(id));
            }
          }
        }

        // ====== BULK BATCH BUFFERS ======
        // Collected during platform loop, bulk-upserted at end (or mid-flushed if huge).
        const campaignsBatch: any[] = [];        // upsert -> public.campaigns
        const mappingsBatch: any[] = [];         // upsert -> campaign_mappings (deduped)
        const metricsBatch: any[] = [];          // upsert -> daily_metrics
        const performanceBatch: any[] = [];      // upsert -> campaign_performance (legacy)
        const seenMappingIds = new Set<string>(); // dedupe mappings within this run
        let apiTotalSpend = 0;                    // for reconciliation log

        // Cache existing campaigns for ID lookup (avoid per-row select)
        const existingCampaigns = new Map<string, { id: string; status: string }>();
        {
          const { data: existRows } = await supabase
            .from("campaigns")
            .select("id, platform_id, status")
            .eq("ad_account_id", account.id);
          for (const c of existRows ?? []) {
            existingCampaigns.set(c.platform_id, { id: c.id, status: c.status });
          }
        }

        // Queue a campaign upsert with guard-protection logic, return the resolved DB id.
        // For NEW campaigns we need to insert immediately to get the id (single round-trip
        // with .select().single()), then subsequent metrics rows reference that id.
        const queueCampaign = async (
          platformId: string,
          name: string,
          status: string,
          clientId: string | null,
          statusConfirmed: boolean = true,
          objective: string = ""
        ): Promise<{ id: string; status: string } | null> => {
          const existing = existingCampaigns.get(platformId);
          if (existing) {
            const isGuardLocked = guardLockedIds.has(existing.id) || existing.status === "guard_paused";
            const finalStatus = isGuardLocked
              ? existing.status
              : (statusConfirmed ? status : existing.status);
            // Queue update via bulk upsert (uses platform_id as conflict key)
            const upd: any = {
              platform_id: platformId,
              name,
              status: finalStatus,
              client_id: clientId,
              platform,
              ad_account_id: account.id,
              org_id: account.org_id,
              original_name_tag: name, // upsert needs all NOT NULL columns; preserved via DB default if exists
              updated_at: new Date().toISOString(),
            };
            if (objective) upd.objective = objective;
            campaignsBatch.push(upd);
            return { id: existing.id, status: finalStatus };
          } else {
            // New campaign: insert immediately to get the DB id (single call)
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
                org_id: account.org_id,
              })
              .select("id")
              .single();
            if (insErr) {
              const { data: retry } = await supabase
                .from("campaigns")
                .select("id, status")
                .eq("platform_id", platformId)
                .maybeSingle();
              if (retry) {
                existingCampaigns.set(platformId, { id: retry.id, status: retry.status });
                return { id: retry.id, status: retry.status };
              }
              return null;
            }
            existingCampaigns.set(platformId, { id: inserted.id, status });
            return { id: inserted.id, status };
          }
        };

        const queueMapping = (platformId: string, campaignName: string, clientId: string) => {
          if (seenMappingIds.has(platformId)) return;
          seenMappingIds.add(platformId);
          mappingsBatch.push({
            campaign_id: platformId,
            campaign_name: campaignName,
            platform,
            client_id: clientId,
            ad_account_id: account.id,
            is_active: true,
            org_id: account.org_id,
          });
        };

        // Mid-loop flush helper: prevents OOM on very large pulls.
        const maybeFlush = async () => {
          if (metricsBatch.length >= FLUSH_THRESHOLD || performanceBatch.length >= FLUSH_THRESHOLD) {
            console.log(`Mid-flush: metrics=${metricsBatch.length}, perf=${performanceBatch.length}, campaigns=${campaignsBatch.length}`);
            await bulkUpsert(supabase, "campaigns", campaignsBatch, "platform_id", errors, "campaigns");
            await bulkUpsert(supabase, "daily_metrics", metricsBatch, "campaign_id,data_date", errors, "daily_metrics");
            await bulkUpsert(supabase, "campaign_performance", performanceBatch, "campaign_id,date", errors, "campaign_performance");
            campaignsBatch.length = 0;
            metricsBatch.length = 0;
            performanceBatch.length = 0;
          }
        };

        if (platform === "meta") {
          if (!integration?.api_token) { errors.push(`Meta ${account.ad_account_id}: No API token`); continue; }

          const metaStatusMap: Record<string, string> = {};
          const metaObjectiveMap: Record<string, string> = {};
          try {
            let statusNextUrl: string | null = `https://graph.facebook.com/v21.0/${account.ad_account_id}/campaigns?fields=id,effective_status,objective&limit=500&access_token=${integration.api_token}`;
            let pageCount = 0;
            while (statusNextUrl && pageCount < MAX_PAGES_META) {
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

                  const rawObj = (c.objective || "").toUpperCase();
                  if (rawObj === "OUTCOME_SALES" || rawObj === "PRODUCT_CATALOG_SALES" || rawObj === "CONVERSIONS") metaObjectiveMap[c.id] = "sales";
                  else if (rawObj === "MESSAGES") metaObjectiveMap[c.id] = "messages";
                  else if (rawObj === "OUTCOME_TRAFFIC" || rawObj === "LINK_CLICKS") metaObjectiveMap[c.id] = "traffic";
                  else if (rawObj === "OUTCOME_LEADS" || rawObj === "LEAD_GENERATION") metaObjectiveMap[c.id] = "leads";
                  else if (rawObj === "OUTCOME_ENGAGEMENT" || rawObj === "POST_ENGAGEMENT" || rawObj === "PAGE_LIKES") metaObjectiveMap[c.id] = "engagement";
                  else if (rawObj === "OUTCOME_AWARENESS" || rawObj === "BRAND_AWARENESS" || rawObj === "REACH") metaObjectiveMap[c.id] = "awareness";
                  else if (rawObj === "VIDEO_VIEWS") metaObjectiveMap[c.id] = "video_views";
                  else if (rawObj) metaObjectiveMap[c.id] = rawObj.toLowerCase().replace(/_/g, " ");
                }
              }
              statusNextUrl = statusJson.paging?.next || null;
              pageCount++;
            }
            if (pageCount >= MAX_PAGES_META) console.warn(`Meta status: hit MAX_PAGES (${MAX_PAGES_META}) for ${account.ad_account_id}`);
          } catch (e: any) {
            errors.push(`Meta status fetch: ${e.message}`);
          }

          const insightsUrl = `https://graph.facebook.com/v21.0/${account.ad_account_id}/insights?fields=campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,reach,actions,action_values,date_start&time_range={"since":"${startDateStr}","until":"${endDateStr}"}&time_increment=1&level=campaign&limit=500&access_token=${integration.api_token}`;

          let allInsights: any[] = [];
          let nextUrl: string | null = insightsUrl;
          let insightsPageCount = 0;
          while (nextUrl && insightsPageCount < MAX_PAGES_META) {
            const res = await fetch(nextUrl);
            const json = await res.json();
            if (json.error) { errors.push(`Meta ${account.ad_account_id}: ${json.error.message}`); break; }
            if (json.data?.length > 0) allInsights = allInsights.concat(json.data);
            nextUrl = json.paging?.next || null;
            insightsPageCount++;
          }
          if (insightsPageCount >= MAX_PAGES_META) console.warn(`Meta insights: hit MAX_PAGES (${MAX_PAGES_META}) for ${account.ad_account_id}`);

          for (const row of allInsights) {
            const spend = parseFloat(row.spend || "0");
            const impressions = parseInt(row.impressions || "0", 10);
            const reach = parseInt(row.reach || "0", 10);
            const clicks = parseInt(row.clicks || "0", 10);
            const ctr = parseFloat(row.ctr || "0");
            const cpc = parseFloat(row.cpc || "0");
            const rawCampaignId = row.campaign_id || `meta_unknown_${Date.now()}`;
            const campaignName = row.campaign_name || "Unknown Campaign";
            const dataDate = row.date_start;

            const clientId = resolveClientId(campaignName, rawCampaignId);
            if (!clientId) { skippedCampaigns++; continue; }

            let results = 0, conversionValue = 0, viewContent = 0, addToCart = 0;
            let initiateCheckout = 0, purchaseCount = 0, messagingConversations = 0;
            let newMessagingContacts = 0, createOrder = 0;

            if (row.actions) {
              for (const action of row.actions) {
                const at = action.action_type;
                const val = parseInt(action.value || "0", 10);
                if (["offsite_conversion", "lead", "purchase", "complete_registration"].includes(at)) results += val;
                if (at === "offsite_conversion.fb_pixel_view_content") viewContent += val;
                if (at === "offsite_conversion.fb_pixel_add_to_cart") addToCart += val;
                if (at === "offsite_conversion.fb_pixel_initiate_checkout") initiateCheckout += val;
                if (at === "offsite_conversion.fb_pixel_purchase") purchaseCount += val;
                if (at === "onsite_conversion.messaging_conversation_started_7d") messagingConversations += val;
                if (at === "onsite_conversion.messaging_first_reply") newMessagingContacts += val;
                if (at === "onsite_conversion.messaging_order_created_v2" || at === "onsite_conversion.messaging_block_create_order" || at.includes("create_order") || at.includes("order_created")) {
                  createOrder += val;
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

            const spendUsd = convertSpend(spend);
            const cpcUsd = convertSpend(cpc);
            const roas = spendUsd > 0 ? Math.round((conversionValue / spendUsd) * 100) / 100 : 0;
            const cpmValue = impressions > 0 ? (spendUsd / impressions) * 1000 : 0;
            const costPerPurchase = purchaseCount > 0 ? spendUsd / purchaseCount : 0;
            const costPerMessage = messagingConversations > 0 ? spendUsd / messagingConversations : 0;
            const platformId = `meta_${rawCampaignId}`;
            const objective = metaObjectiveMap[rawCampaignId] || "";

            const statusConfirmed = rawCampaignId in metaStatusMap;
            const metaCampaignStatus = metaStatusMap[rawCampaignId] || "active";
            const campaignResult = await queueCampaign(platformId, campaignName, metaCampaignStatus, clientId, statusConfirmed, objective);
            if (!campaignResult) { errors.push(`Failed to upsert campaign ${platformId}`); continue; }

            queueMapping(platformId, campaignName, clientId);
            apiTotalSpend += spendUsd;

            metricsBatch.push({
              campaign_id: campaignResult.id,
              data_date: dataDate,
              spend: spendUsd, impressions, clicks, results,
              conversion_value: conversionValue, ctr, cpc: cpcUsd, roas,
              view_content: viewContent, add_to_cart: addToCart,
              initiate_checkout: initiateCheckout, purchase: purchaseCount,
              messaging_conversations: messagingConversations,
              new_messaging_contacts: newMessagingContacts,
              create_order: createOrder, reach,
              cost_per_purchase: Math.round(costPerPurchase * 100) / 100,
              cost_per_message: Math.round(costPerMessage * 100) / 100,
              cpm: Math.round(cpmValue * 100) / 100,
              synced_at: new Date().toISOString(),
              org_id: account.org_id,
            });

            performanceBatch.push({
              campaign_id: rawCampaignId,
              campaign_name: campaignName,
              ad_account_id: account.id,
              client_id: clientId,
              date: dataDate,
              impressions, clicks, ctr, cpc: cpcUsd, spend: spendUsd, results,
              conversion_value: conversionValue, roas,
              status: campaignResult.status,
              synced_at: new Date().toISOString(),
              org_id: account.org_id,
            });

            await maybeFlush();
          }

          console.log(`Meta deep-dive: ${allInsights.length} rows for ${account.ad_account_id}`);

        } else if (platform === "google") {
          if (!integration?.api_token) { errors.push(`Google ${account.ad_account_id}: No API token`); continue; }

          const customerId = account.ad_account_id.replace(/-/g, "");
          const gaqlQuery = `SELECT campaign.id, campaign.name, campaign.status, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${startDateStr}' AND '${endDateStr}' LIMIT 10000`;

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

            const platformId = `google_${rawCampaignId}`;
            const clientId = resolveClientId(campaignName, platformId);
            if (!clientId) { skippedCampaigns++; continue; }

            const statusMap: Record<string, string> = { ENABLED: "active", PAUSED: "paused", REMOVED: "removed" };
            const googleStatusConfirmed = !!row.campaign?.status;
            const status = statusMap[row.campaign?.status] || "active";

            const campaignResult = await queueCampaign(platformId, campaignName, status, clientId, googleStatusConfirmed);
            if (!campaignResult) { errors.push(`Failed to upsert campaign ${platformId}`); continue; }

            queueMapping(platformId, campaignName, clientId);
            apiTotalSpend += spendUsd;

            metricsBatch.push({
              campaign_id: campaignResult.id,
              data_date: dataDate,
              spend: spendUsd, impressions, clicks, results: Math.round(conversions),
              conversion_value: conversionValue, ctr, cpc: cpcUsd, roas,
              synced_at: new Date().toISOString(),
              org_id: account.org_id,
            });

            performanceBatch.push({
              campaign_id: platformId,
              campaign_name: campaignName,
              ad_account_id: account.id,
              client_id: clientId,
              date: dataDate, impressions, clicks, ctr, cpc: cpcUsd, spend: spendUsd,
              results: Math.round(conversions), conversion_value: conversionValue,
              roas, status: campaignResult.status,
              synced_at: new Date().toISOString(),
              org_id: account.org_id,
            });

            await maybeFlush();
          }

          console.log(`Google deep-dive: ${gResults.length} rows for ${account.ad_account_id}`);

        } else if (platform === "tiktok") {
          if (!integration?.api_token) { errors.push(`TikTok ${account.ad_account_id}: No API token`); continue; }

          const bcId = integration.app_id || "";
          const dateChunks = generateDateChunks(startDateStr, endDateStr);
          console.log(`TikTok ${account.ad_account_id}: ${dateChunks.length} chunk(s) [${startDateStr}→${endDateStr}], base=${tiktokBase}`);
          let allTiktokRows: any[] = [];
          let tiktokFailed = false;

          for (const chunk of dateChunks) {
            let page = 1;
            let totalPages = 1;
            let chunkRows = 0;

            do {
              if (page > MAX_PAGES_TIKTOK) {
                console.warn(`TikTok ${account.ad_account_id}: hit MAX_PAGES (${MAX_PAGES_TIKTOK}) on chunk ${chunk.start}-${chunk.end}`);
                break;
              }
              let cJson: any = null;
              if (bcId) {
                const bcParams = new URLSearchParams({
                  bc_id: bcId,
                  advertiser_ids: JSON.stringify([account.ad_account_id]),
                  service_type: "AUCTION",
                  report_type: "BASIC",
                  data_level: "AUCTION_CAMPAIGN",
                  dimensions: '["campaign_id","stat_time_day"]',
                  metrics: '["campaign_name","spend","impressions","clicks","ctr","cpc","conversion","conversion_cost","complete_payment_roas","reach","onsite_form","onsite_on_web_detail"]',
                  start_date: chunk.start,
                  end_date: chunk.end,
                  page_size: "500",
                  page: String(page),
                });
                const bcRes = await tiktokFetchWithRetry(
                  `${tiktokBase}/open_api/v1.3/report/integrated/get/?${bcParams}`,
                  { "Access-Token": integration.api_token, "Content-Type": "application/json" }
                );
                cJson = bcRes;
                if (cJson.code !== 0) {
                  console.warn(`TikTok BC chunk ${chunk.start}-${chunk.end} p${page} failed: [${cJson.code}] ${cJson.message}. Falling back.`);
                  cJson = null;
                }
              }
              if (!cJson) {
                const params = new URLSearchParams({
                  advertiser_id: account.ad_account_id,
                  report_type: "BASIC",
                  data_level: "AUCTION_CAMPAIGN",
                  dimensions: '["campaign_id","stat_time_day"]',
                  metrics: '["campaign_name","spend","impressions","clicks","ctr","cpc","conversion","conversion_cost","complete_payment_roas","reach","onsite_form","onsite_on_web_detail"]',
                  start_date: chunk.start,
                  end_date: chunk.end,
                  page_size: "500",
                  page: String(page),
                });
                const directRes = await tiktokFetchWithRetry(
                  `${tiktokBase}/open_api/v1.3/report/integrated/get/?${params}`,
                  { "Access-Token": integration.api_token, "Content-Type": "application/json" }
                );
                cJson = directRes;
                if (cJson.code !== 0) {
                  console.error(`TikTok chunk ${chunk.start}-${chunk.end} p${page} error:`, JSON.stringify(cJson));
                  errors.push(`TikTok ${account.ad_account_id}: [code ${cJson.code}] ${cJson.message}`);
                  tiktokFailed = true;
                  break;
                }
              }
              const pageRows = cJson.data?.list || [];
              allTiktokRows = allTiktokRows.concat(pageRows);
              chunkRows += pageRows.length;
              totalPages = cJson.data?.page_info?.total_page || 1;
              page++;
            } while (page <= totalPages);

            if (tiktokFailed) break;
            console.log(`TikTok chunk ${chunk.start}-${chunk.end}: ${chunkRows} rows (${totalPages} page(s))`);
          }

          if (tiktokFailed) continue;

          // Fetch TikTok campaign statuses + budgets
          const tiktokStatusMap: Record<string, string> = {};
          const tiktokBudgetMap: Record<string, number> = {};
          try {
            const statusParams = new URLSearchParams({ advertiser_id: account.ad_account_id, page_size: "500" });
            const statusRes = await tiktokFetchWithRetry(
              `${tiktokBase}/open_api/v1.3/campaign/get/?${statusParams}`,
              { "Access-Token": integration.api_token, "Content-Type": "application/json" }
            );
            if (statusRes.code === 0 && statusRes.data?.list) {
              for (const c of statusRes.data.list) {
                const opStatus = (c.operation_status || "").toUpperCase();
                const secStatus = (c.secondary_status || "").toUpperCase();
                if (c.budget !== undefined && c.budget !== null) {
                  tiktokBudgetMap[c.campaign_id] = parseFloat(c.budget) || 0;
                }
                const activeStatuses = [
                  "CAMPAIGN_STATUS_ENABLE",
                  "CAMPAIGN_STATUS_ADVERTISER_BUDGET_FULL",
                  "CAMPAIGN_STATUS_ALL_ADGROUP_PAUSED",
                  "CAMPAIGN_STATUS_BUDGET_EXCEED",
                  "CAMPAIGN_STATUS_NOT_START",
                ];
                if (opStatus === "CAMPAIGN_STATUS_DELETE") tiktokStatusMap[c.campaign_id] = "deleted";
                else if (opStatus === "CAMPAIGN_STATUS_DISABLE") tiktokStatusMap[c.campaign_id] = "paused";
                else if (activeStatuses.includes(opStatus)) {
                  if (secStatus.includes("ALL_ADGROUP_PAUSED") || opStatus === "CAMPAIGN_STATUS_ALL_ADGROUP_PAUSED") tiktokStatusMap[c.campaign_id] = "active - ad groups paused";
                  else if (secStatus.includes("BUDGET_EXCEED") || opStatus === "CAMPAIGN_STATUS_BUDGET_EXCEED") tiktokStatusMap[c.campaign_id] = "active - budget exceeded";
                  else if (secStatus.includes("NOT_START") || opStatus === "CAMPAIGN_STATUS_NOT_START") tiktokStatusMap[c.campaign_id] = "active - not started";
                  else tiktokStatusMap[c.campaign_id] = "active";
                } else {
                  tiktokStatusMap[c.campaign_id] = opStatus.toLowerCase().replace(/campaign_status_/g, "").replace(/_/g, " ");
                }
              }
            }
          } catch (e: any) {
            errors.push(`TikTok status fetch: ${e.message}`);
          }

          for (const row of allTiktokRows) {
            const spend = parseFloat(row.metrics?.spend || "0");
            const impressions = parseInt(row.metrics?.impressions || "0", 10);
            const clicks = parseInt(row.metrics?.clicks || "0", 10);
            const ctr = parseFloat(row.metrics?.ctr || "0") * 100;
            const cpc = parseFloat(row.metrics?.cpc || "0");
            const conversions = parseInt(row.metrics?.conversion || "0", 10);
            const roas = parseFloat(row.metrics?.complete_payment_roas || "0");
            const tiktokReach = parseInt(row.metrics?.reach || "0", 10);
            const tiktokConvDm = parseInt(row.metrics?.onsite_on_web_detail || "0", 10);
            const tiktokLeadsDm = tiktokConvDm > 0 ? conversions : 0;
            const rawCampaignId = row.dimensions?.campaign_id;
            const campaignName = row.metrics?.campaign_name || `TikTok Campaign ${rawCampaignId}`;
            const dataDate = (row.dimensions?.stat_time_day || "").split(" ")[0];

            const platformId = `tiktok_${rawCampaignId}`;
            const clientId = resolveClientId(campaignName, platformId);
            if (!clientId) { skippedCampaigns++; continue; }

            const tiktokCampaignStatus = tiktokStatusMap[rawCampaignId] || "active";
            const campaignResult = await queueCampaign(platformId, campaignName, tiktokCampaignStatus, clientId, true);
            if (!campaignResult) { errors.push(`Failed to upsert campaign ${platformId}`); continue; }

            queueMapping(platformId, campaignName, clientId);

            const spendUsd = convertSpend(spend);
            const cpcUsd = convertSpend(cpc);
            const tiktokBudget = tiktokBudgetMap[rawCampaignId] ?? 0;
            const tiktokBudgetUsd = convertSpend(tiktokBudget);
            const cpmValue = impressions > 0 ? (spendUsd / impressions) * 1000 : 0;
            apiTotalSpend += spendUsd;

            metricsBatch.push({
              campaign_id: campaignResult.id,
              data_date: dataDate,
              spend: spendUsd, impressions, clicks, results: conversions,
              conversion_value: 0, ctr, cpc: cpcUsd, roas,
              reach: tiktokReach,
              cpm: Math.round(cpmValue * 100) / 100,
              budget: tiktokBudgetUsd,
              conversations_tiktok_dm: tiktokConvDm,
              leads_tiktok_dm: tiktokLeadsDm,
              conversations_instant_msg: 0,
              synced_at: new Date().toISOString(),
              org_id: account.org_id,
            });

            performanceBatch.push({
              campaign_id: platformId,
              campaign_name: campaignName,
              ad_account_id: account.id,
              client_id: clientId,
              date: dataDate, impressions, clicks, ctr, cpc: cpcUsd, spend: spendUsd,
              results: conversions, conversion_value: 0, roas,
              status: campaignResult.status,
              synced_at: new Date().toISOString(),
              org_id: account.org_id,
            });

            await maybeFlush();
          }

          console.log(`TikTok deep-dive: ${allTiktokRows.length} rows for ${account.ad_account_id}`);
        }

        // ====== FINAL FLUSH: bulk-upsert any remaining rows ======
        await bulkUpsert(supabase, "campaigns", campaignsBatch, "platform_id", errors, "campaigns");
        await bulkUpsert(supabase, "campaign_mappings", mappingsBatch, "campaign_id", errors, "campaign_mappings");
        await bulkUpsert(supabase, "daily_metrics", metricsBatch, "campaign_id,data_date", errors, "daily_metrics");
        await bulkUpsert(supabase, "campaign_performance", performanceBatch, "campaign_id,date", errors, "campaign_performance");

        // ====== RECONCILIATION LOG: detect drift ======
        try {
          const campaignIdsForRecon = Array.from(existingCampaigns.values()).map(c => c.id);
          let dbTotalSpend = 0;
          if (campaignIdsForRecon.length > 0) {
            const CHUNK = 500;
            for (let i = 0; i < campaignIdsForRecon.length; i += CHUNK) {
              const slice = campaignIdsForRecon.slice(i, i + CHUNK);
              const { data: rows } = await supabase
                .from("daily_metrics")
                .select("spend")
                .in("campaign_id", slice)
                .gte("data_date", startDateStr)
                .lte("data_date", endDateStr);
              for (const r of rows ?? []) dbTotalSpend += Number(r.spend) || 0;
            }
          }
          const delta = Math.round((apiTotalSpend - dbTotalSpend) * 100) / 100;
          await supabase.from("sync_reconciliation_log").insert({
            ad_account_id: account.id,
            org_id: account.org_id,
            platform,
            date_from: startDateStr,
            date_to: endDateStr,
            api_total_spend: Math.round(apiTotalSpend * 100) / 100,
            db_total_spend: Math.round(dbTotalSpend * 100) / 100,
            delta,
            rows_processed: metricsBatch.length + performanceBatch.length,
            notes: Math.abs(delta) > RECONCILIATION_TOLERANCE ? "DRIFT_DETECTED" : null,
          });
          if (Math.abs(delta) > RECONCILIATION_TOLERANCE) {
            console.warn(`Drift on ${account.account_name || account.id}: API=$${apiTotalSpend}, DB=$${dbTotalSpend}, delta=$${delta}`);
          }
        } catch (e: any) {
          console.error(`Reconciliation log failed for ${account.id}:`, e?.message);
        }

        totalSynced++;
      } catch (err: any) {
        errors.push(`${platform} ${account.ad_account_id}: ${err.message}`);
      }
    }

    const integrationIds = [...new Set(accounts.map((a) => a.api_integration_id).filter(Boolean))];
    if (integrationIds.length > 0) {
      await supabase.from("api_integrations").update({ last_synced_at: new Date().toISOString() }).in("id", integrationIds);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Deep dive sync complete",
        accounts_synced: totalSynced,
        skipped_no_keyword_match: skippedCampaigns,
        errors: errors.length > 0 ? errors : undefined,
        error_code: errors.length > 0 ? "partial_errors" : undefined,
        rows_synced: totalSynced,
        date_range: { from: globalStartDate, to: endDateStr },
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("sync-deep-dive error:", error);
    const errMsg = error.message || String(error);
    let errorCode = "api_error";
    if (errMsg.includes("CPU") || errMsg.includes("timeout")) errorCode = "cpu_timeout";
    else if (errMsg.includes("190") || errMsg.includes("token")) errorCode = "token_expired";
    else if (errMsg.includes("41000")) errorCode = "geo_blocked";
    return new Response(
      JSON.stringify({ ok: false, error: errMsg, error_code: errorCode }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
