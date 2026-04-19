import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIKTOK_BASE_URL = "https://business-api.tiktok.com";

// Bulletproof Fast-Lane limits
const MAX_PAGES_META = 30;
const MAX_PAGES_TIKTOK = 10;

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

    // Parse optional filters for manual sync
    let targetClientId: string | null = null;
    let adAccountIdsFilter: string[] | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        targetClientId = body.client_id || null;
        adAccountIdsFilter = body.ad_account_ids || null;
      } catch { /* no body is fine for cron */ }
    }
    if (adAccountIdsFilter) console.log(`Ad account IDs filter active: ${adAccountIdsFilter.join(", ")}`);

    // ===== MAPPING-FIRST: Only get accounts with client mappings AND keywords =====
    const { data: mappedAssignments } = await supabase
      .from("ad_account_clients")
      .select("ad_account_id, client_id, mapping_keyword")
      .neq("mapping_keyword", "");

    if (!mappedAssignments || mappedAssignments.length === 0) {
      return new Response(
        JSON.stringify({ message: "No mapped accounts with keywords to sync", synced: 0 }),
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
    let accountQuery = supabase
      .from("ad_accounts")
      .select("id, ad_account_id, platform_name, client_id, api_integration_id, account_currency, exchange_rate, org_id, api_integrations!ad_accounts_api_integration_id_fkey(api_token, app_id, platform)")
      .eq("is_active", true)
      .in("id", mappedAccountIds);

    if (adAccountIdsFilter && adAccountIdsFilter.length > 0) {
      accountQuery = accountQuery.in("id", adAccountIdsFilter);
    } else if (targetClientId) {
      // Filter to accounts mapped to this specific client
      const clientMappedAccountIds = mappedAssignments
        .filter(r => r.client_id === targetClientId)
        .map(r => r.ad_account_id);
      if (clientMappedAccountIds.length === 0) {
        return new Response(
          JSON.stringify({ message: "No mapped accounts for this client", synced: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      accountQuery = accountQuery.in("id", clientMappedAccountIds);
    }

    const { data: accounts, error: accErr } = await accountQuery;
    if (accErr) throw accErr;
    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active mapped accounts", synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read configurable sync start date from settings
    const { data: dateSetting } = await supabase
      .from("settings").select("value").eq("key", "sync_start_date").maybeSingle();
    const globalStartDate = dateSetting?.value || "2025-01-01";
    // Use Asia/Dhaka timezone for "today"
    const endDateStr = getDhakaToday();

    // Load client profiles for per-client start dates
    const allClientIds = [...new Set(mappedAssignments.map(r => r.client_id))];
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
      const linkedClients = (accountKeywordMap[accountId] || []).map(k => k.client_id);
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

    // Get TikTok proxy URL setting
    const { data: proxySetting } = await supabase
      .from("settings").select("value").eq("key", "tiktok_proxy_url").maybeSingle();
    const tiktokProxyUrl = proxySetting?.value || null;
    const tiktokBase = getTikTokBaseUrl(tiktokProxyUrl);
    if (tiktokProxyUrl) console.log(`Using TikTok proxy: ${tiktokProxyUrl}`);

    let syncedCount = 0;
    let skipped = 0;
    const errors: string[] = [];
    // Track per-account row counts for activity gating (drives deep-dive scheduling)
    const accountRowCounts: Record<string, number> = {};

    for (const account of accounts) {
      const integration = (account as any).api_integrations;
      const currency = account.account_currency || "USD";
      const platform = account.platform_name;
      const accountAssignments = accountKeywordMap[account.id] ?? [];

      const startDateStr = getAccountStartDate(account.id);
      accountRowCounts[account.id] = accountRowCounts[account.id] ?? 0;

      // Per-run mapping cache: dedupe campaign_mappings writes
      const seenMappingIds = new Set<string>();
      const mappingsBatch: any[] = [];
      const queueMapping = (platformId: string, campaignName: string, clientId: string, plat: string) => {
        if (seenMappingIds.has(platformId)) return;
        seenMappingIds.add(platformId);
        mappingsBatch.push({
          campaign_id: platformId,
          campaign_name: campaignName,
          platform: plat as any,
          client_id: clientId,
          ad_account_id: account.id,
          is_active: true,
          org_id: account.org_id,
        });
      };

      // Fast-Lane Meta: narrow window to last 3 days (today + 2 days late attribution).
      // Reason: a 16-month range causes Meta to return huge paginated payloads that
      // often time out or return empty for low-volume accounts, falsely tripping
      // the zero-run counter. 3 days is enough to catch fresh + late-arriving spend;
      // historical backfill is the Deep-Dive's job.
      const metaFastLaneStart = (() => {
        const d = new Date(endDateStr + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - 2);
        return d.toISOString().split("T")[0];
      })();

      try {
        if (platform === "meta") {
          // ===== META: Real API with time_increment=1 =====
          if (!integration?.api_token) {
            errors.push(`Meta ${account.ad_account_id}: No API token`);
            continue;
          }

          const insightsUrl = `https://graph.facebook.com/v21.0/${account.ad_account_id}/insights?fields=campaign_name,spend,date_start&time_range={"since":"${metaFastLaneStart}","until":"${endDateStr}"}&time_increment=1&limit=500&access_token=${integration.api_token}`;

          let allInsights: any[] = [];
          let nextUrl: string | null = insightsUrl;
          let metaPageCount = 0;

          while (nextUrl && metaPageCount < MAX_PAGES_META) {
            const res = await fetch(nextUrl);
            const json = await res.json();
            metaPageCount++;
            if (json.error) { errors.push(`Meta ${account.ad_account_id}: ${json.error.message}`); break; }
            if (json.data?.length > 0) allInsights = allInsights.concat(json.data);
            nextUrl = json.paging?.next || null;
          }

          const spendRecords: any[] = [];
          for (const row of allInsights) {
            const spend = parseFloat(row.spend || "0");
            if (spend <= 0) continue;

            const campaignName = row.campaign_name || "Meta Spend";
            
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

            // Queue campaign_mappings entry (deduped, bulk-flushed at end)
            const metaPlatformId = `meta_${row.campaign_id || ''}`;
            queueMapping(metaPlatformId, campaignName, matchedClientId, "meta");

            const isBDT = currency === "BDT";
            const accountRate = isBDT ? (account.exchange_rate ?? exchangeRate) : 1;
            const finalUsd = isBDT ? Math.round((spend / accountRate) * 100) / 100 : spend;

            spendRecords.push({
              ad_account_id: account.id,
              date: row.date_start,
              campaign_name: campaignName,
              raw_spend_amount: spend,
              raw_currency: currency,
              exchange_rate_used: isBDT ? accountRate : 1,
              final_billable_usd: finalUsd,
              client_id: matchedClientId,
              synced_at: new Date().toISOString(),
              org_id: account.org_id,
            });
          }

          // Deduplicate by (ad_account_id, date, campaign_name) to prevent "cannot affect row a second time"
          const deduped = Object.values(
            spendRecords.reduce((acc: Record<string, any>, r) => {
              const key = `${r.ad_account_id}|${r.date}|${r.campaign_name}`;
              acc[key] = r; // last write wins
              return acc;
            }, {})
          );

          for (let i = 0; i < deduped.length; i += 100) {
            const batch = deduped.slice(i, i + 100);
            const { error } = await supabase
              .from("daily_ad_spend")
              .upsert(batch, { onConflict: "ad_account_id,date,campaign_name", ignoreDuplicates: false });
            if (error) errors.push(`Meta ${account.ad_account_id} upsert: ${error.message}`);
          }

          accountRowCounts[account.id] += spendRecords.length;
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

            const campaignName = row.campaign?.name || "Google Campaign";

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

            // Auto-create campaign_mappings entry for Google
            const googlePlatformId = `google_${row.campaign?.id || ''}`;
            await supabase.from("campaign_mappings").upsert({
              campaign_id: googlePlatformId,
              campaign_name: campaignName,
              platform: "google" as any,
              client_id: matchedClientId,
              ad_account_id: account.id,
              is_active: true,
              org_id: account.org_id,
            }, { onConflict: "campaign_id" });

            const isBDTGoogle = currency === "BDT";
            const googleAccountRate = isBDTGoogle ? (account.exchange_rate ?? 1) : 1;
            const googleFinalUsd = isBDTGoogle ? Math.round((spend / googleAccountRate) * 100) / 100 : spend;

            spendRecords.push({
              ad_account_id: account.id,
              date: row.segments?.date,
              campaign_name: campaignName,
              raw_spend_amount: spend,
              raw_currency: currency,
              exchange_rate_used: googleAccountRate,
              final_billable_usd: googleFinalUsd,
              client_id: matchedClientId,
              synced_at: new Date().toISOString(),
              org_id: account.org_id,
            });
          }

          // Deduplicate by (ad_account_id, date, campaign_name)
          const dedupedGoogle = Object.values(
            spendRecords.reduce((acc: Record<string, any>, r) => {
              const key = `${r.ad_account_id}|${r.date}|${r.campaign_name}`;
              acc[key] = r;
              return acc;
            }, {})
          );

          for (let i = 0; i < dedupedGoogle.length; i += 100) {
            const batch = dedupedGoogle.slice(i, i + 100);
            const { error } = await supabase
              .from("daily_ad_spend")
              .upsert(batch, { onConflict: "ad_account_id,date,campaign_name", ignoreDuplicates: false });
            if (error) errors.push(`Google ${account.ad_account_id} upsert: ${error.message}`);
          }

          accountRowCounts[account.id] += spendRecords.length;
          console.log(`Google fast-lane: ${spendRecords.length} rows for ${account.ad_account_id}`);

        } else if (platform === "tiktok") {
          // ===== TIKTOK: BC-scoped reporting to bypass geo-restrictions =====
          if (!integration?.api_token) {
            errors.push(`TikTok ${account.ad_account_id}: No API token`);
            continue;
          }

          const bcId = integration.app_id || "";
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

              if (bcId) {
                const bcParams = new URLSearchParams({
                  bc_id: bcId,
                  advertiser_ids: JSON.stringify([account.ad_account_id]),
                  service_type: "AUCTION",
                  report_type: "BASIC",
                  data_level: "AUCTION_CAMPAIGN",
                  dimensions: '["campaign_id","stat_time_day"]',
                  metrics: '["campaign_name","spend"]',
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
                  metrics: '["campaign_name","spend"]',
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
            console.log(`TikTok fast-lane chunk ${chunk.start}-${chunk.end}: ${chunkRows} rows (${totalPages} page(s))`);
          }

          if (tiktokFailed) continue;
          const rows = allTiktokRows;
          const spendRecords: any[] = [];

          for (const row of rows) {
            const spend = parseFloat(row.metrics?.spend || "0");
            if (spend <= 0) continue;

            const date = (row.dimensions?.stat_time_day || "").split(" ")[0];
            const campaignName = row.metrics?.campaign_name || "TikTok Spend";

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

            // Auto-create campaign_mappings entry for TikTok
            const tiktokPlatformId = `tiktok_${row.dimensions?.campaign_id || ''}`;
            await supabase.from("campaign_mappings").upsert({
              campaign_id: tiktokPlatformId,
              campaign_name: campaignName,
              platform: "tiktok" as any,
              client_id: matchedClientId,
              ad_account_id: account.id,
              is_active: true,
              org_id: account.org_id,
            }, { onConflict: "campaign_id" });

            const isBDTTiktok = currency === "BDT";
            const tiktokAccountRate = isBDTTiktok ? (account.exchange_rate ?? 1) : 1;
            const tiktokFinalUsd = isBDTTiktok ? Math.round((spend / tiktokAccountRate) * 100) / 100 : spend;

            spendRecords.push({
              ad_account_id: account.id,
              date,
              campaign_name: campaignName,
              raw_spend_amount: spend,
              raw_currency: currency,
              exchange_rate_used: tiktokAccountRate,
              final_billable_usd: tiktokFinalUsd,
              client_id: matchedClientId,
              synced_at: new Date().toISOString(),
              org_id: account.org_id,
            });
          }

          // Deduplicate by (ad_account_id, date, campaign_name)
          const dedupedTiktok = Object.values(
            spendRecords.reduce((acc: Record<string, any>, r) => {
              const key = `${r.ad_account_id}|${r.date}|${r.campaign_name}`;
              acc[key] = r;
              return acc;
            }, {})
          );

          for (let i = 0; i < dedupedTiktok.length; i += 100) {
            const batch = dedupedTiktok.slice(i, i + 100);
            const { error } = await supabase
              .from("daily_ad_spend")
              .upsert(batch, { onConflict: "ad_account_id,date,campaign_name", ignoreDuplicates: false });
            if (error) errors.push(`TikTok ${account.ad_account_id} upsert: ${error.message}`);
          }

          accountRowCounts[account.id] += spendRecords.length;
          console.log(`TikTok fast-lane: ${spendRecords.length} rows for ${account.ad_account_id}`);
        }

        syncedCount++;
      } catch (err: any) {
        errors.push(`${platform} ${account.ad_account_id}: ${err.message}`);
      }
    }

    // ===== Refresh billing cycle data for Meta accounts =====
    const metaAccounts = accounts.filter((a: any) => a.platform_name === "meta");
    for (const account of metaAccounts) {
      const integration = (account as any).api_integrations;
      if (!integration?.api_token) continue;
      try {
        const bcUrl = `https://graph.facebook.com/v21.0/${account.ad_account_id}/adspaymentcycle?fields=threshold_amount,amount_spent,end_time&access_token=${integration.api_token}`;
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
          await supabase.from("ad_accounts").update(updateFields).eq("id", account.id);
          console.log(`Updated billing data for ${account.ad_account_id}: ${JSON.stringify(updateFields)}`);
        }
      } catch (err: any) {
        console.warn(`Failed to fetch billing cycle for ${account.ad_account_id}: ${err.message}`);
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

    // ===== Persist per-account Fast-Lane activity stats (gates Deep-Dive scheduling) =====
    const nowIso = new Date().toISOString();
    const accountIds = Object.keys(accountRowCounts);
    if (accountIds.length > 0) {
      const { data: existingStats } = await supabase
        .from("sync_account_stats")
        .select("ad_account_id, consecutive_zero_runs, org_id")
        .in("ad_account_id", accountIds);
      const existingMap = new Map((existingStats ?? []).map((s: any) => [s.ad_account_id, s]));

      // ===== Activity backstop: check daily_metrics for real recent spend =====
      // If Deep-Dive populated rows in the last 3 days even when Fast-Lane saw zero,
      // the account IS active — reset the counter so Deep-Dive keeps running.
      const threeDaysAgo = (() => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - 3);
        return d.toISOString().split("T")[0];
      })();

      const activeAccountIds = new Set<string>();
      try {
        const { data: recentCampaigns } = await supabase
          .from("campaigns")
          .select("id, ad_account_id")
          .in("ad_account_id", accountIds);
        const campaignToAccount = new Map<string, string>();
        for (const c of recentCampaigns ?? []) campaignToAccount.set(c.id, c.ad_account_id);
        const campaignIds = Array.from(campaignToAccount.keys());

        if (campaignIds.length > 0) {
          // Chunk to avoid IN-list limits
          const CHUNK = 500;
          for (let i = 0; i < campaignIds.length; i += CHUNK) {
            const slice = campaignIds.slice(i, i + CHUNK);
            const { data: metrics } = await supabase
              .from("daily_metrics")
              .select("campaign_id, spend")
              .in("campaign_id", slice)
              .gte("data_date", threeDaysAgo)
              .gt("spend", 0);
            for (const m of metrics ?? []) {
              const accId = campaignToAccount.get(m.campaign_id);
              if (accId) activeAccountIds.add(accId);
            }
          }
        }
      } catch (e: any) {
        console.error("Activity backstop check failed:", e?.message);
      }

      const upserts = accountIds.map((accId) => {
        const rows = accountRowCounts[accId];
        const prev = existingMap.get(accId) as any;
        const prevZero = prev?.consecutive_zero_runs ?? 0;
        const orgId = accounts.find((a) => a.id === accId)?.org_id ?? prev?.org_id ?? null;
        const isActiveByMetrics = activeAccountIds.has(accId);
        // Reset counter if Fast-Lane saw rows OR daily_metrics shows real recent spend
        const shouldReset = rows > 0 || isActiveByMetrics;
        return {
          ad_account_id: accId,
          org_id: orgId,
          last_fast_lane_at: nowIso,
          last_fast_lane_rows: rows,
          consecutive_zero_runs: shouldReset ? 0 : prevZero + 1,
          updated_at: nowIso,
        };
      });

      const { error: actErr } = await supabase
        .from("sync_account_stats")
        .upsert(upserts, { onConflict: "ad_account_id" });
      if (actErr) console.error("Activity stats upsert failed:", actErr.message);
      else console.log(`Activity stats updated for ${upserts.length} accounts (${activeAccountIds.size} active by metrics backstop)`);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Fast lane sync complete`,
        synced: syncedCount,
        skipped_no_keyword_match: skipped,
        errors: errors.length > 0 ? errors : undefined,
        error_code: errors.length > 0 ? "partial_errors" : undefined,
        rows_synced: syncedCount,
        date_range: { from: globalStartDate, to: endDateStr },
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("sync-fast-lane error:", error);
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
