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
      .select("id, ad_account_id, platform_name, client_id, api_integration_id, account_currency, exchange_rate, api_integrations!ad_accounts_api_integration_id_fkey(api_token, app_id, platform)")
      .eq("is_active", true);

    if (accErr) throw accErr;
    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active accounts", synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load all ad_account_clients with client configs from profiles
    const { data: aacRows } = await supabase
      .from("ad_account_clients")
      .select("ad_account_id, client_id");

    // Build map: ad_account_id -> client_ids
    const accountClientMap: Record<string, string[]> = {};
    for (const row of aacRows ?? []) {
      if (!accountClientMap[row.ad_account_id]) accountClientMap[row.ad_account_id] = [];
      accountClientMap[row.ad_account_id].push(row.client_id);
    }

    // Load all client profiles that have filter tags or start dates
    const allClientIds = [...new Set((aacRows ?? []).map(r => r.client_id))];
    const clientConfigs: Record<string, { filter_tag: string | null; start_date: string | null; timezone: string }> = {};

    if (allClientIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, ad_account_filter_tag, data_fetch_start_date, preferred_timezone")
        .in("user_id", allClientIds);

      for (const p of profiles ?? []) {
        clientConfigs[p.user_id] = {
          filter_tag: p.ad_account_filter_tag,
          start_date: p.data_fetch_start_date,
          timezone: p.preferred_timezone || "Asia/Dhaka",
        };
      }
    }

    // Read global sync start date
    const { data: dateSetting } = await supabase
      .from("settings").select("value").eq("key", "sync_start_date").maybeSingle();
    const globalStartDate = dateSetting?.value || "2025-01-01";
    const endDateStr = new Date().toISOString().split("T")[0];

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
    const errors: string[] = [];

    for (const account of accounts) {
      const integration = (account as any).api_integrations;
      const platform = account.platform_name;

      try {
        // Determine per-account client configs
        const linkedClientIds = accountClientMap[account.id] || [];
        const clientFilterTags: { clientId: string; tag: string }[] = [];
        let effectiveStartDate = globalStartDate;

        for (const cid of linkedClientIds) {
          const cfg = clientConfigs[cid];
          if (cfg?.filter_tag) {
            clientFilterTags.push({ clientId: cid, tag: cfg.filter_tag });
          }
        }

        // Pick the earliest client start date that's >= globalStartDate
        const clientDates = linkedClientIds
          .map(cid => clientConfigs[cid]?.start_date)
          .filter((d): d is string => !!d && d >= globalStartDate);

        if (clientDates.length > 0) {
          clientDates.sort();
          effectiveStartDate = clientDates[0]; // earliest
        }

        const startDateStr = effectiveStartDate;

        // Helper: resolve client_id for a campaign name
        const resolveClientId = (campaignName: string, rawCampaignId: string): string | null => {
          // First check filter tags
          for (const { clientId, tag } of clientFilterTags) {
            if (campaignName.includes(tag)) return clientId;
          }
          // Then check campaign mappings
          if (campaignClientMap[rawCampaignId]) return campaignClientMap[rawCampaignId];
          // Fallback to account's direct client
          if (linkedClientIds.length === 1) return linkedClientIds[0];
          return account.client_id;
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
          statusConfirmed: boolean = true
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
            await supabase
              .from("campaigns")
              .update({ name, status: finalStatus, client_id: clientId, updated_at: new Date().toISOString() })
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
          }
        ) => {
          const { error } = await supabase
            .from("daily_metrics")
            .upsert(
              {
                campaign_id: campaignDbId,
                data_date: dataDate,
                ...metrics,
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

          // Fetch real campaign statuses from Meta
          const metaStatusMap: Record<string, string> = {};
          try {
            let statusNextUrl: string | null = `https://graph.facebook.com/v21.0/${account.ad_account_id}/campaigns?fields=id,effective_status&limit=500&access_token=${integration.api_token}`;
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
                }
              }
              statusNextUrl = statusJson.paging?.next || null;
            }
          } catch (e: any) {
            errors.push(`Meta status fetch: ${e.message}`);
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
            const rawCampaignId = row.campaign_id || `meta_unknown_${Date.now()}`;
            const campaignName = row.campaign_name || "Unknown Campaign";
            const dataDate = row.date_start; // API's actual date

            // Filter by tag: if tags exist, campaign must match at least one
            if (clientFilterTags.length > 0) {
              const matchesAnyTag = clientFilterTags.some(({ tag }) => campaignName.includes(tag));
              if (!matchesAnyTag) continue;
            }

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

            const spendUsd = convertSpend(spend);
            const cpcUsd = convertSpend(cpc);
            const roas = spendUsd > 0 ? Math.round((conversionValue / spendUsd) * 100) / 100 : 0;
            const platformId = `meta_${rawCampaignId}`;
            const clientId = resolveClientId(campaignName, rawCampaignId);

            // ID Locking: upsert into campaigns table
            const metaCampaignStatus = metaStatusMap[rawCampaignId] || "active";
            const campaignDbId = await upsertCampaign(platformId, campaignName, metaCampaignStatus, clientId);
            if (!campaignDbId) { errors.push(`Failed to upsert campaign ${platformId}`); continue; }

            // Upsert daily metrics
            await upsertMetrics(campaignDbId, dataDate, {
              spend: spendUsd, impressions, clicks, results, conversion_value: conversionValue, ctr, cpc: cpcUsd, roas,
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
                status: metaCampaignStatus,
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

            // Filter by tag
            if (clientFilterTags.length > 0) {
              const matchesAnyTag = clientFilterTags.some(({ tag }) => campaignName.includes(tag));
              if (!matchesAnyTag) continue;
            }

            const platformId = `google_${rawCampaignId}`;
            const clientId = resolveClientId(campaignName, platformId);
            const statusMap: Record<string, string> = { ENABLED: "active", PAUSED: "paused", REMOVED: "removed" };
            const status = statusMap[row.campaign?.status] || "active";

            const campaignDbId = await upsertCampaign(platformId, campaignName, status, clientId);
            if (!campaignDbId) { errors.push(`Failed to upsert campaign ${platformId}`); continue; }

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
                roas, status,
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

          // Fetch real campaign statuses from TikTok
          const tiktokStatusMap: Record<string, string> = {};
          try {
            const statusParams = new URLSearchParams({
              advertiser_id: account.ad_account_id,
              page_size: "500",
            });
            const statusRes = await fetch(
              `https://business-api.tiktok.com/open_api/v1.3/campaign/get/?${statusParams}`,
              { headers: { "Access-Token": integration.api_token, "Content-Type": "application/json" } }
            );
            const statusJson = await statusRes.json();
            if (statusJson.code === 0 && statusJson.data?.list) {
              for (const c of statusJson.data.list) {
                const opStatus = c.operation_status || c.secondary_status || "";
                if (opStatus === "CAMPAIGN_STATUS_ENABLE" || opStatus === "CAMPAIGN_STATUS_ADVERTISER_BUDGET_FULL") {
                  tiktokStatusMap[c.campaign_id] = "active";
                } else {
                  tiktokStatusMap[c.campaign_id] = "paused";
                }
              }
            }
          } catch (e: any) {
            errors.push(`TikTok status fetch: ${e.message}`);
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

            // Filter by tag
            if (clientFilterTags.length > 0) {
              const matchesAnyTag = clientFilterTags.some(({ tag }) => campaignName.includes(tag));
              if (!matchesAnyTag) continue;
            }

            const platformId = `tiktok_${rawCampaignId}`;
            const clientId = resolveClientId(campaignName, platformId);

            const tiktokCampaignStatus = tiktokStatusMap[rawCampaignId] || "active";
            const campaignDbId = await upsertCampaign(platformId, campaignName, tiktokCampaignStatus, clientId);
            if (!campaignDbId) { errors.push(`Failed to upsert campaign ${platformId}`); continue; }

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
                status: tiktokCampaignStatus,
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
