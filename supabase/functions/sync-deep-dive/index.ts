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

  // Soft time budget — give ourselves 18s of the 22s edge budget. Past this point,
  // skip remaining accounts so the next 15-min orchestrator run can pick them up
  // cleanly instead of being aborted mid-write (which leaves stale daily_metrics).
  const startTime = Date.now();
  const TIME_BUDGET_MS = 18_000;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse optional filters from request body
    let body: any = {};
    try { body = await req.json(); } catch {}
    const platformFilter: string | null = body?.platform || null;
    const adAccountIdsFilter: string[] | null = body?.ad_account_ids || null;
    // Adaptive chunking: optional date window override (per-chunk job)
    const dateFromOverride: string | null = body?.date_from || null;
    const dateToOverride: string | null = body?.date_to || null;
    if (platformFilter) console.log(`Platform filter active: ${platformFilter}`);
    if (adAccountIdsFilter) console.log(`Ad account IDs filter active: ${adAccountIdsFilter.join(", ")}`);
    if (dateFromOverride && dateToOverride) console.log(`Chunk window: ${dateFromOverride} → ${dateToOverride}`);

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

    // Read global sync start date
    const { data: dateSetting } = await supabase
      .from("settings").select("value").eq("key", "sync_start_date").maybeSingle();
    const globalStartDate = dateSetting?.value || "2025-01-01";
    // Use Asia/Dhaka timezone for "today" — overridable by chunk window
    const endDateStr = dateToOverride || getDhakaToday();

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
    let skippedForTimeBudget = 0;
    const errors: string[] = [];

    // Get TikTok proxy URL setting
    const { data: proxySetting } = await supabase
      .from("settings").select("value").eq("key", "tiktok_proxy_url").maybeSingle();
    const tiktokProxyUrl = proxySetting?.value || null;
    const tiktokBase = getTikTokBaseUrl(tiktokProxyUrl);
    if (tiktokProxyUrl) console.log(`Using TikTok proxy: ${tiktokProxyUrl}`);

    for (const account of accounts) {
      // Soft time budget: stop enqueuing new accounts past the budget so the next
      // run picks them up. Prevents mid-write aborts that leave daily_metrics stale.
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        skippedForTimeBudget++;
        console.log(`Time budget exhausted, deferring ${account.account_name} to next run`);
        continue;
      }
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

        // Adaptive chunking override: when worker passes a chunk window, use it
        // (clamp to per-account effective start to honor client data_fetch_start_date)
        const startDateStr = dateFromOverride
          ? (dateFromOverride > effectiveStartDate ? dateFromOverride : effectiveStartDate)
          : effectiveStartDate;

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
        // Build a set of guard-locked campaign IDs to prevent sync from overwriting
        const guardLockedIds = new Set<string>();
        const guardLockedClientByCampaign = new Map<string, string>();
        {
          const linkedClientIds = accountAssignments.map(a => a.client_id);
          if (linkedClientIds.length > 0) {
            const { data: clientProfiles } = await supabase
              .from("profiles")
              .select("user_id, system_paused_campaigns")
              .in("user_id", linkedClientIds);
            for (const p of clientProfiles ?? []) {
              const paused = (p as any).system_paused_campaigns;
              if (Array.isArray(paused)) {
                for (const id of paused) {
                  const sid = String(id);
                  guardLockedIds.add(sid);
                  guardLockedClientByCampaign.set(sid, (p as any).user_id);
                }
              }
            }
          }
        }

        // Track campaigns reconciled paused→active by platform during this run
        const reconciledResumeIds: string[] = [];

        const isPlatformActive = (s: string): boolean => {
          const v = (s || "").toLowerCase();
          return v === "active" || v === "enable" || v.startsWith("active -");
        };

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
            const isGuardLocked = guardLockedIds.has(existing.id) || existing.status === "guard_paused";
            let finalStatus: string;
            // RECONCILE: if platform confirms the campaign is active, override guard_paused locally
            if (isGuardLocked && statusConfirmed && isPlatformActive(status)) {
              finalStatus = "active";
              reconciledResumeIds.push(existing.id);
              console.log(`Guard-reconcile: platform reports active, resuming campaign ${existing.id}`);
            } else if (isGuardLocked) {
              // Preserve the guard state — sync must NOT undo Ad Guard while platform still paused
              finalStatus = existing.status;
            } else if (!statusConfirmed) {
              finalStatus = existing.status;
            } else {
              finalStatus = status;
            }
            const updatePayload: any = { name, status: finalStatus, client_id: clientId, updated_at: new Date().toISOString() };
            if (finalStatus === "active" && isGuardLocked) {
              updatePayload.pause_required = false;
              updatePayload.pause_requested_at = null;
              updatePayload.pause_confirmed_at = null;
              updatePayload.pause_attempt_count = 0;
              updatePayload.pause_error = null;
            }
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
                org_id: account.org_id,
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
            budget?: number;
            conversations_tiktok_dm?: number;
            leads_tiktok_dm?: number;
            conversations_instant_msg?: number;
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
                budget: metrics.budget ?? 0,
                conversations_tiktok_dm: metrics.conversations_tiktok_dm ?? 0,
                leads_tiktok_dm: metrics.leads_tiktok_dm ?? 0,
                conversations_instant_msg: metrics.conversations_instant_msg ?? 0,
                synced_at: new Date().toISOString(),
                org_id: account.org_id,
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
              // Debug: log all action types for the first row of each account
              if (metaRowIndex < 3) {
                const allTypes = row.actions.map((a: any) => `${a.action_type}=${a.value}`);
                console.log(`Meta actions [${account.ad_account_id}] campaign="${campaignName}" date=${row.date_start}: ${allTypes.join(', ')}`);
              }
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
                // Broad match for create_order - covers multiple possible Meta action types
                if (at === "onsite_conversion.messaging_order_created_v2" || at === "onsite_conversion.messaging_block_create_order" || at.includes("create_order") || at.includes("order_created")) {
                  createOrder += val;
                }
              }
            }
            metaRowIndex++;
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

            // Auto-create campaign_mappings entry
            await supabase.from("campaign_mappings").upsert({
              campaign_id: platformId,
              campaign_name: campaignName,
              platform,
              client_id: clientId,
              ad_account_id: account.id,
              is_active: true,
              org_id: account.org_id,
            }, { onConflict: "campaign_id" });

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
                org_id: account.org_id,
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

            // Auto-create campaign_mappings entry
            await supabase.from("campaign_mappings").upsert({
              campaign_id: platformId,
              campaign_name: campaignName,
              platform,
              client_id: clientId,
              ad_account_id: account.id,
              is_active: true,
              org_id: account.org_id,
            }, { onConflict: "campaign_id" });

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
                org_id: account.org_id,
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
            // Pagination loop for each chunk
            let page = 1;
            let totalPages = 1;
            let chunkRows = 0;

            do {
              let cJson: any = null;
              let usedBc = false;

              if (bcId) {
          const bcParams = new URLSearchParams({
                  bc_id: bcId,
                  advertiser_ids: JSON.stringify([account.ad_account_id]),
                  service_type: "AUCTION",
                  report_type: "BASIC",
                  data_level: "AUCTION_CAMPAIGN",
                  dimensions: '["campaign_id","stat_time_day"]',
metrics: '["campaign_name","spend","impressions","clicks","ctr","cpc","conversion","conversion_cost","complete_payment_roas","reach","onsite_form","onsite_on_web_detail","total_view_content","total_add_to_cart","total_initiate_checkout","total_complete_payment","cost_per_complete_payment"]',
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
                } else {
                  usedBc = true;
                }
              }

              if (!cJson) {
              const params = new URLSearchParams({
                  advertiser_id: account.ad_account_id,
                  report_type: "BASIC",
                  data_level: "AUCTION_CAMPAIGN",
                  dimensions: '["campaign_id","stat_time_day"]',
metrics: '["campaign_name","spend","impressions","clicks","ctr","cpc","conversion","conversion_cost","complete_payment_roas","reach","onsite_form","onsite_on_web_detail","complete_payment","cost_per_complete_payment"]',
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
          json = { data: { list: allTiktokRows } };

          // Fetch real campaign statuses, budgets AND objectives from TikTok
          const tiktokStatusMap: Record<string, string> = {};
          const tiktokBudgetMap: Record<string, number> = {};
          const tiktokObjectiveMap: Record<string, string> = {};
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
                // Extract budget (TikTok returns budget in currency units)
                if (c.budget !== undefined && c.budget !== null) {
                  tiktokBudgetMap[c.campaign_id] = parseFloat(c.budget) || 0;
                }
                // Map TikTok objective_type → simplified label (mirrors Meta mapping)
                const rawObj = (c.objective_type || "").toUpperCase();
                if (rawObj === "WEB_CONVERSIONS" || rawObj === "PRODUCT_SALES" || rawObj === "CONVERSIONS" || rawObj === "SHOP_PURCHASES") {
                  tiktokObjectiveMap[c.campaign_id] = "sales";
                } else if (rawObj === "LEAD_GENERATION") {
                  tiktokObjectiveMap[c.campaign_id] = "leads";
                } else if (rawObj === "TRAFFIC") {
                  tiktokObjectiveMap[c.campaign_id] = "traffic";
                } else if (rawObj === "ENGAGEMENT" || rawObj === "COMMUNITY_INTERACTION") {
                  tiktokObjectiveMap[c.campaign_id] = "engagement";
                } else if (rawObj === "REACH") {
                  tiktokObjectiveMap[c.campaign_id] = "awareness";
                } else if (rawObj === "VIDEO_VIEWS") {
                  tiktokObjectiveMap[c.campaign_id] = "video_views";
                } else if (rawObj === "APP_PROMOTION" || rawObj === "APP_INSTALL") {
                  tiktokObjectiveMap[c.campaign_id] = "app_promotion";
                } else if (rawObj) {
                  tiktokObjectiveMap[c.campaign_id] = rawObj.toLowerCase().replace(/_/g, " ");
                }

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
          const syncedAtIso = new Date().toISOString();

          // ===== PHASE A: parse rows + sequential upsertCampaign (cheap, needs ID) =====
          // We must keep upsertCampaign sequential because each call does a select-then-update
          // that depends on existing-row state (status, original_name_tag, guard locking).
          type PreparedRow = {
            platformId: string;
            campaignDbId: string;
            campaignName: string;
            clientId: string;
            dataDate: string;
            spendUsd: number;
            cpcUsd: number;
            ctr: number;
            impressions: number;
            clicks: number;
            conversions: number;
            roas: number;
            tiktokReach: number;
            tiktokConvDm: number;
            tiktokLeadsDm: number;
            tiktokViewContent: number;
            tiktokAddToCart: number;
            tiktokInitiateCheckout: number;
            tiktokPurchase: number;
            tiktokCostPerPurchaseUsd: number;
            tiktokBudgetUsd: number;
            cpmValue: number;
            finalTiktokStatus: string;
          };

          const prepared: PreparedRow[] = [];

          for (const row of rows) {
            const rawCampaignId = row.dimensions?.campaign_id;
            const campaignName = row.metrics?.campaign_name || `TikTok Campaign ${rawCampaignId}`;
            const dataDate = (row.dimensions?.stat_time_day || "").split(" ")[0];

            // ===== KEYWORD MATCHING: Skip if no match =====
            const platformId = `tiktok_${rawCampaignId}`;
            const clientId = resolveClientId(campaignName, platformId);
            if (!clientId) { skippedCampaigns++; continue; }

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

            // BC reports return `total_*` (web+app+offline pixel events). Direct/advertiser
            // reports only support the non-`total_` variants. Read either source.
            const tiktokViewContent      = parseFloat(row.metrics?.total_view_content       || row.metrics?.view_content       || "0");
            const tiktokAddToCart        = parseFloat(row.metrics?.total_add_to_cart        || row.metrics?.add_to_cart        || "0");
            const tiktokInitiateCheckout = parseFloat(row.metrics?.total_initiate_checkout  || row.metrics?.initiate_checkout  || "0");
            const tiktokPurchase         = parseFloat(row.metrics?.total_complete_payment   || row.metrics?.complete_payment   || "0");
            const tiktokCostPerPurchase  = parseFloat(row.metrics?.cost_per_complete_payment || "0");

            const tiktokStatusConfirmed = true;
            const tiktokCampaignStatus = tiktokStatusMap[rawCampaignId] || "active";
            const tiktokObjective = tiktokObjectiveMap[rawCampaignId] || "";
            const campaignResult = await upsertCampaign(platformId, campaignName, tiktokCampaignStatus, clientId, tiktokStatusConfirmed, tiktokObjective);
            if (!campaignResult) { errors.push(`Failed to upsert campaign ${platformId}`); continue; }

            const spendUsd = convertSpend(spend);
            const cpcUsd = convertSpend(cpc);
            const tiktokBudget = tiktokBudgetMap[rawCampaignId] ?? 0;
            const tiktokBudgetUsd = convertSpend(tiktokBudget);
            const cpmValue = impressions > 0 ? (spendUsd / impressions) * 1000 : 0;

            prepared.push({
              platformId, campaignDbId: campaignResult.id, campaignName, clientId, dataDate,
              spendUsd, cpcUsd, ctr, impressions, clicks, conversions, roas,
              tiktokReach, tiktokConvDm, tiktokLeadsDm,
              tiktokViewContent, tiktokAddToCart, tiktokInitiateCheckout, tiktokPurchase,
              tiktokCostPerPurchaseUsd: convertSpend(tiktokCostPerPurchase),
              tiktokBudgetUsd, cpmValue,
              finalTiktokStatus: campaignResult.status,
            });
          }

          // ===== PHASE B: bulk + parallel writes =====
          // 1) campaign_mappings — single bulk upsert (one row per unique campaign).
          //    Dedupe by platformId so the upsert array has no duplicate conflict targets.
          const mappingMap = new Map<string, any>();
          for (const p of prepared) {
            mappingMap.set(p.platformId, {
              campaign_id: p.platformId,
              campaign_name: p.campaignName,
              platform,
              client_id: p.clientId,
              ad_account_id: account.id,
              is_active: true,
              org_id: account.org_id,
            });
          }
          if (mappingMap.size > 0) {
            // No unique index on campaign_mappings.campaign_id, so we can't use ON CONFLICT.
            // Pattern: select existing IDs, insert only the missing ones (idempotent + safe).
            const allIds = Array.from(mappingMap.keys());
            const existingIds = new Set<string>();
            for (let i = 0; i < allIds.length; i += 200) {
              const slice = allIds.slice(i, i + 200);
              const { data: ex } = await supabase
                .from("campaign_mappings")
                .select("campaign_id")
                .in("campaign_id", slice);
              for (const r of ex ?? []) existingIds.add(r.campaign_id);
            }
            const toInsert = Array.from(mappingMap.values()).filter((r: any) => !existingIds.has(r.campaign_id));
            for (let i = 0; i < toInsert.length; i += 100) {
              const batch = toInsert.slice(i, i + 100);
              const { error: mErr } = await supabase.from("campaign_mappings").insert(batch);
              if (mErr) errors.push(`TikTok campaign_mappings insert: ${mErr.message}`);
            }
          }

          // 2) daily_metrics — parallel batches of 5 (idempotent per (campaign_id, data_date)).
          const BATCH = 5;
          for (let i = 0; i < prepared.length; i += BATCH) {
            const slice = prepared.slice(i, i + BATCH);
            const results = await Promise.allSettled(slice.map((p) =>
              upsertMetrics(p.campaignDbId, p.dataDate, {
                spend: p.spendUsd, impressions: p.impressions, clicks: p.clicks, results: p.conversions,
                conversion_value: 0, ctr: p.ctr, cpc: p.cpcUsd, roas: p.roas,
                reach: p.tiktokReach,
                cpm: Math.round(p.cpmValue * 100) / 100,
                budget: p.tiktokBudgetUsd,
                conversations_tiktok_dm: p.tiktokConvDm,
                leads_tiktok_dm: p.tiktokLeadsDm,
                conversations_instant_msg: 0,
                view_content: p.tiktokViewContent,
                add_to_cart: p.tiktokAddToCart,
                initiate_checkout: p.tiktokInitiateCheckout,
                purchase: p.tiktokPurchase,
                cost_per_purchase: p.tiktokCostPerPurchaseUsd,
              })
            ));
            for (const r of results) {
              if (r.status === "rejected") errors.push(`TikTok upsertMetrics: ${r.reason?.message || r.reason}`);
            }
          }

          // 3) campaign_performance (legacy) — single bulk upsert per account.
          //    Dedupe by (campaign_id, date) to satisfy the unique constraint.
          const perfMap = new Map<string, any>();
          for (const p of prepared) {
            const key = `${p.platformId}|${p.dataDate}`;
            perfMap.set(key, {
              campaign_id: p.platformId,
              campaign_name: p.campaignName,
              ad_account_id: account.id,
              client_id: p.clientId,
              date: p.dataDate,
              impressions: p.impressions,
              clicks: p.clicks,
              ctr: p.ctr,
              cpc: p.cpcUsd,
              spend: p.spendUsd,
              results: p.conversions,
              conversion_value: 0,
              roas: p.roas,
              status: p.finalTiktokStatus,
              synced_at: syncedAtIso,
              org_id: account.org_id,
            });
          }
          if (perfMap.size > 0) {
            const perfRows = Array.from(perfMap.values());
            for (let i = 0; i < perfRows.length; i += 100) {
              const batch = perfRows.slice(i, i + 100);
              const { error: pErr } = await supabase
                .from("campaign_performance")
                .upsert(batch, { onConflict: "campaign_id,date", ignoreDuplicates: false });
              if (pErr) errors.push(`TikTok campaign_performance bulk upsert: ${pErr.message}`);
            }
          }

          console.log(`TikTok deep-dive: ${rows.length} rows (${prepared.length} matched) for ${account.ad_account_id}`);
        }

        // ===== Ad Guard reconcile cleanup =====
        // For campaigns the platform reported active during this run, remove
        // them from the owning client's system_paused_campaigns list, drop the
        // pause queue rows, and write an audit log entry per affected client.
        if (reconciledResumeIds.length > 0) {
          try {
            const affectedClients = new Set<string>();
            for (const cid of reconciledResumeIds) {
              const owner = guardLockedClientByCampaign.get(cid);
              if (owner) affectedClients.add(owner);
            }

            await supabase
              .from("guard_pause_jobs")
              .delete()
              .in("campaign_id", reconciledResumeIds);

            for (const ownerId of affectedClients) {
              const { data: prof } = await supabase
                .from("profiles")
                .select("system_paused_campaigns, org_id")
                .eq("user_id", ownerId)
                .maybeSingle();
              const list = Array.isArray((prof as any)?.system_paused_campaigns)
                ? ((prof as any).system_paused_campaigns as any[]).map(String)
                : [];
              const remaining = list.filter((id) => !reconciledResumeIds.includes(id));
              const cleared = list.length - remaining.length;
              const updatePatch: any = { system_paused_campaigns: remaining };
              if (remaining.length === 0) updatePatch.guard_paused_at = null;
              await supabase
                .from("profiles")
                .update(updatePatch)
                .eq("user_id", ownerId);

              if (cleared > 0) {
                await supabase.from("audit_logs").insert({
                  user_id: ownerId,
                  action_type: "ad_guard_resume",
                  description: `Auto-resumed ${cleared} campaign(s): detected active on ${platform} during sync`,
                  org_id: (prof as any)?.org_id ?? null,
                });
              }
            }
          } catch (e: any) {
            console.error("Guard reconcile cleanup failed:", e?.message);
          }
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
        ok: true,
        message: "Deep dive sync complete",
        accounts_synced: totalSynced,
        skipped_no_keyword_match: skippedCampaigns,
        skipped_for_time_budget: skippedForTimeBudget,
        elapsed_ms: Date.now() - startTime,
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
