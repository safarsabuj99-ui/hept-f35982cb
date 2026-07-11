import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Safe JSON parser for proxy responses that may prepend/append garbage ──
async function safeJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text.trim());
  } catch {
    const jsonStart = text.search(/[\{\[]/);
    const lastBrace = text.lastIndexOf('}');
    const lastBracket = text.lastIndexOf(']');
    const jsonEnd = Math.max(lastBrace, lastBracket);
    if (jsonStart !== -1 && jsonEnd !== -1) {
      try {
        return JSON.parse(text.substring(jsonStart, jsonEnd + 1));
      } catch {
        throw new Error(`Invalid JSON response: ${text.substring(0, 200)}`);
      }
    }
    throw new Error(`Non-JSON response: ${text.substring(0, 200)}`);
  }
}

type MetaOwnership = "owned" | "partner" | "system_user";

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function normalizeMetaAccountId(raw: unknown): string {
  return String(raw ?? "").trim().replace(/^act_/i, "");
}

function formatMetaAccountId(raw: unknown): string {
  const normalized = normalizeMetaAccountId(raw);
  return normalized ? `act_${normalized}` : String(raw ?? "").trim();
}

function makeAccountKey(platform: string, adAccountId: unknown): string {
  const id = platform === "meta" ? normalizeMetaAccountId(adAccountId) : String(adAccountId ?? "").trim();
  return `${platform}:${id}`;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Meta: fetch billing cycle data for a single ad account ──
async function fetchMetaBillingCycle(adAccountId: string, token: string) {
  const url = `https://graph.facebook.com/v21.0/${adAccountId}/adspaymentcycle?fields=threshold_amount,amount_spent,end_time&access_token=${token}`;
  const res = await fetchWithTimeout(url, {}, 2500);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`billing ${adAccountId}: status ${res.status} ${err.substring(0, 180)}`);
  }
  const json = await safeJson(res);
  const cycle = json.data?.[0];
  if (!cycle) return null;

  const thresholdLimit = cycle.threshold_amount ? Number(cycle.threshold_amount) / 100 : null;
  const currentSpend = cycle.amount_spent ? Number(cycle.amount_spent) / 100 : null;
  let nextBillingDate: string | null = null;
  if (cycle.end_time) {
    const d = typeof cycle.end_time === "number"
      ? new Date(cycle.end_time * 1000)
      : new Date(cycle.end_time);
    if (!isNaN(d.getTime())) {
      nextBillingDate = d.toISOString().split("T")[0];
    }
  }

  return { thresholdLimit, currentSpend, nextBillingDate };
}

// ── Meta: fetch a paginated ad-account edge (owned or client) from BM ──
async function fetchMetaAccountEdge(
  businessId: string,
  edge: "owned_ad_accounts" | "client_ad_accounts",
  token: string,
): Promise<any[]> {
  const fields = "account_id,name,currency,funding_source_details,account_status";
  let url: string | null =
    `https://graph.facebook.com/v21.0/${businessId}/${edge}?fields=${fields}&limit=500&access_token=${token}`;
  const out: any[] = [];
  let pages = 0;
  while (url && pages < 10) {
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Meta ${edge} API error (status ${res.status}): ${err.substring(0, 400)}`);
    }
    const json = await safeJson(res);
    for (const acc of json.data ?? []) out.push(acc);
    url = json.paging?.next ?? null;
    pages++;
  }
  return out;
}

// ── Meta: fetch ad accounts the System User has direct access to ──
async function fetchMetaSystemUserAccounts(token: string): Promise<any[]> {
  const fields = "account_id,name,currency,funding_source_details,account_status,business";
  let url: string | null =
    `https://graph.facebook.com/v21.0/me/adaccounts?fields=${fields}&limit=500&access_token=${token}`;
  const out: any[] = [];
  let pages = 0;
  while (url && pages < 10) {
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Meta me/adaccounts API error (status ${res.status}): ${err.substring(0, 400)}`);
    }
    const json = await safeJson(res);
    for (const acc of json.data ?? []) out.push(acc);
    url = json.paging?.next ?? null;
    pages++;
  }
  return out;
}

// ── Meta: partner-shared businesses sometimes expose accounts through agency businesses ──
async function fetchMetaPartnerBusinessAccounts(
  businessId: string,
  token: string,
): Promise<{ accounts: any[]; warnings: string[] }> {
  const warnings: string[] = [];
  let url: string | null =
    `https://graph.facebook.com/v21.0/${businessId}/agencies?fields=id,name&limit=100&access_token=${token}`;
  const businesses: any[] = [];
  let pages = 0;

  while (url && pages < 5) {
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Meta agencies API error (status ${res.status}): ${err.substring(0, 400)}`);
    }
    const json = await safeJson(res);
    for (const biz of json.data ?? []) businesses.push(biz);
    url = json.paging?.next ?? null;
    pages++;
  }

  const settled = await Promise.allSettled(
    businesses.slice(0, 10).map(async (biz) => {
      const rows = await fetchMetaAccountEdge(String(biz.id), "owned_ad_accounts", token);
      return rows.map((acc) => ({ ...acc, partner_business: { id: biz.id, name: biz.name } }));
    }),
  );

  const accounts: any[] = [];
  settled.forEach((result, index) => {
    const biz = businesses[index];
    if (result.status === "fulfilled") {
      accounts.push(...result.value);
    } else {
      warnings.push(`partner business ${biz?.name ?? biz?.id ?? index}: ${getErrorMessage(result.reason)}`);
    }
  });

  return { accounts, warnings };
}


// ── Meta: fetch owned + partner + system-user ad accounts ──
async function fetchMetaAccounts(
  appId: string,
  token: string,
): Promise<{ accounts: any[]; warnings: string[]; counts: Record<string, number> }> {
  const warnings: string[] = [];

  const [ownedRes, partnerRes, systemUserRes, partnerBusinessRes] = await Promise.allSettled([
    fetchMetaAccountEdge(appId, "owned_ad_accounts", token),
    fetchMetaAccountEdge(appId, "client_ad_accounts", token),
    fetchMetaSystemUserAccounts(token),
    fetchMetaPartnerBusinessAccounts(appId, token),
  ]);

  if (ownedRes.status === "rejected") {
    throw ownedRes.reason instanceof Error ? ownedRes.reason : new Error(String(ownedRes.reason));
  }
  const owned = ownedRes.value;

  let partner: any[] = [];
  if (partnerRes.status === "fulfilled") {
    partner = partnerRes.value;
  } else {
    const msg = getErrorMessage(partnerRes.reason);
    warnings.push(msg);
    console.warn(`Partner (client_ad_accounts) fetch failed: ${msg}`);
  }

  let systemUser: any[] = [];
  if (systemUserRes.status === "fulfilled") {
    systemUser = systemUserRes.value;
  } else {
    const msg = getErrorMessage(systemUserRes.reason);
    warnings.push(msg);
    console.warn(`System User (me/adaccounts) fetch failed: ${msg}`);
  }

  let partnerBusiness: any[] = [];
  if (partnerBusinessRes.status === "fulfilled") {
    partnerBusiness = partnerBusinessRes.value.accounts;
    warnings.push(...partnerBusinessRes.value.warnings);
  } else {
    const msg = getErrorMessage(partnerBusinessRes.reason);
    warnings.push(msg);
    console.warn(`Partner business discovery failed: ${msg}`);
  }

  // Merge, dedupe by account_id (precedence: owned > partner > system_user)
  const map = new Map<string, { acc: any; ownership: MetaOwnership }>();
  for (const acc of systemUser) {
    const id = normalizeMetaAccountId(acc?.account_id);
    if (id) map.set(id, { acc, ownership: "system_user" });
  }
  for (const acc of partnerBusiness) {
    const id = normalizeMetaAccountId(acc?.account_id);
    if (id) map.set(id, { acc, ownership: "partner" });
  }
  for (const acc of partner) {
    const id = normalizeMetaAccountId(acc?.account_id);
    if (id) map.set(id, { acc, ownership: "partner" });
  }
  for (const acc of owned) {
    const id = normalizeMetaAccountId(acc?.account_id);
    if (id) map.set(id, { acc, ownership: "owned" });
  }
  console.log(
    `Meta fetch: owned=${owned.length}, partner=${partner.length}, partner_business=${partnerBusiness.length}, system_user=${systemUser.length}, merged=${map.size}`,
  );

  const enriched = await Promise.allSettled(Array.from(map.values()).map(async ({ acc, ownership }) => {
    let billingType = "prepaid";
    let thresholdLimit: number | null = null;
    let nextBillingDate: string | null = null;
    let currentThresholdSpend: number | null = null;
    let billingWarning: string | null = null;

    if (acc.funding_source_details) {
      const fsd = acc.funding_source_details;
      if (fsd.type === 2 || fsd.display_string?.toLowerCase().includes("threshold")) {
        billingType = "threshold_postpaid";
        thresholdLimit = fsd.amount ? Number(fsd.amount) / 100 : null;
      }
      if (fsd.coupon?.expiration_date) {
        nextBillingDate = fsd.coupon.expiration_date;
      }
    }

    const currency = acc.currency === "BDT" ? "BDT" : "USD";
    const formattedId = formatMetaAccountId(acc.account_id);

    try {
      const billingCycle = await fetchMetaBillingCycle(formattedId, token);
      if (billingCycle) {
        if (billingCycle.thresholdLimit) {
          billingType = "threshold_postpaid";
          thresholdLimit = billingCycle.thresholdLimit;
        }
        if (billingCycle.nextBillingDate) {
          nextBillingDate = billingCycle.nextBillingDate;
        }
        if (billingCycle.currentSpend !== null) {
          currentThresholdSpend = billingCycle.currentSpend;
        }
      }
    } catch (err) {
      // Billing/payment-cycle permissions vary by account. Discovery/import must not fail or
      // show noisy operator errors when this optional enrichment is unavailable.
      console.warn(`Meta billing enrichment skipped: ${getErrorMessage(err)}`);
    }

    return {
      account: {
        ad_account_id: formattedId,
        account_name: acc.name ?? "",
        account_currency: currency,
        billing_type: billingType,
        threshold_limit: thresholdLimit,
        next_billing_date: nextBillingDate,
        current_threshold_spend: currentThresholdSpend ?? 0,
        ownership,
      },
      warning: billingWarning,
    };
  }));

  const accounts: any[] = [];
  for (const result of enriched) {
    if (result.status === "fulfilled") {
      accounts.push(result.value.account);
      if (result.value.warning) warnings.push(result.value.warning);
    } else {
      warnings.push(`Meta account enrichment failed: ${getErrorMessage(result.reason)}`);
    }
  }

  return {
    accounts,
    warnings,
    counts: {
      owned: owned.length,
      partner: partner.length,
      partner_business: partnerBusiness.length,
      system_user: systemUser.length,
      merged: map.size,
    },
  };
}


// ── TikTok: discover advertisers from Business Center, then fetch details ──
async function fetchTikTokAccounts(appId: string, token: string, tiktokBase: string) {
  const bcId = appId.trim();
  if (!bcId) return [];

  const advertiserIds: string[] = [];
  const advertiserNames: string[] = [];
  let page = 1;
  const pageSize = 50;

  while (true) {
    const bcUrl = `${tiktokBase}/open_api/v1.3/bc/asset/get/?bc_id=${bcId}&asset_type=ADVERTISER&page=${page}&page_size=${pageSize}`;
    const bcRes = await fetch(bcUrl, {
      headers: { "Access-Token": token, "Content-Type": "application/json" },
    });
    if (!bcRes.ok) {
      const errText = await bcRes.text();
      throw new Error(`TikTok BC Asset API error: ${errText}`);
    }
    const bcJson = await safeJson(bcRes);
    if (bcJson.code !== 0) {
      throw new Error(`TikTok BC error: ${bcJson.message} (code ${bcJson.code})`);
    }

    const list = bcJson.data?.list ?? [];
    for (const item of list) {
      const advId = item.advertiser_id || item.asset_id || item.id || item.advertiser_info?.advertiser_id;
      if (advId) {
        advertiserIds.push(String(advId));
        advertiserNames.push(item.asset_name || item.advertiser_name || "");
      }
    }

    const totalCount = bcJson.data?.page_info?.total_number ?? list.length;
    if (page * pageSize >= totalCount || list.length === 0) break;
    page++;
  }

  if (advertiserIds.length === 0) return [];

  const detailMap: Record<string, { currency: string; name: string }> = {};
  try {
    let detailPage = 1;
    const detailPageSize = 50;
    while (true) {
      const detailUrl = `${tiktokBase}/open_api/v1.3/bc/advertiser/get/?bc_id=${bcId}&page=${detailPage}&page_size=${detailPageSize}`;
      const detailRes = await fetch(detailUrl, {
        headers: { "Access-Token": token, "Content-Type": "application/json" },
      });
      const detailJson = await safeJson(detailRes);
      if (detailJson.code === 0 && detailJson.data?.list) {
        for (const adv of detailJson.data.list) {
          const advId = String(adv.advertiser_id || adv.id || "");
          if (advId) {
            detailMap[advId] = {
              currency: adv.currency || "USD",
              name: adv.advertiser_name || adv.name || "",
            };
          }
        }
        const detailTotal = detailJson.data?.page_info?.total_number ?? detailJson.data.list.length;
        if (detailPage * detailPageSize >= detailTotal || detailJson.data.list.length === 0) break;
        detailPage++;
      } else {
        break;
      }
    }
  } catch (e) {
    console.warn(`TikTok BC advertiser detail call failed: ${e.message}`);
  }

  const balanceMap: Record<string, { cash: number; grant: number }> = {};
  const chunkSize = 20;
  for (let i = 0; i < advertiserIds.length; i += chunkSize) {
    const chunk = advertiserIds.slice(i, i + chunkSize);
    try {
      const idsParam = encodeURIComponent(JSON.stringify(chunk));
      const balanceUrl = `${tiktokBase}/open_api/v1.3/advertiser/balance/get/?bc_id=${bcId}&advertiser_ids=${idsParam}`;
      const balRes = await fetch(balanceUrl, {
        headers: { "Access-Token": token, "Content-Type": "application/json" },
      });
      const balJson = await safeJson(balRes);
      if (balJson.code === 0 && balJson.data?.list) {
        for (const b of balJson.data.list) {
          const bId = String(b.advertiser_id || "");
          if (bId) {
            balanceMap[bId] = {
              cash: Number(b.cash_balance ?? b.balance ?? 0),
              grant: Number(b.grant_balance ?? 0),
            };
          }
        }
      }
    } catch (e) {
      console.warn(`TikTok balance batch failed: ${e.message}`);
    }
  }

  return advertiserIds.map((id, idx) => {
    const detail = detailMap[id];
    const bal = balanceMap[id];
    const rawCurrency = detail?.currency?.toUpperCase() || "USD";
    const accountCurrency = rawCurrency === "BDT" ? "BDT" : "USD";

    return {
      ad_account_id: id,
      account_name: detail?.name || advertiserNames[idx] || `TikTok Advertiser ${id}`,
      account_currency: accountCurrency,
      billing_type: "prepaid",
      threshold_limit: null,
      next_billing_date: null,
      current_threshold_spend: bal ? bal.cash + bal.grant : null,
    };
  });
}

// ── Google: fetch accessible customer accounts ──
async function fetchGoogleAccounts(appId: string, token: string) {
  const customerId = appId.replace(/-/g, "");
  const url = `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:searchStream`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "developer-token": Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "",
      "Content-Type": "application/json",
      "login-customer-id": customerId,
    },
    body: JSON.stringify({
      query: `SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.status FROM customer_client WHERE customer_client.status = 'ENABLED'`,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Ads API error: ${err}`);
  }

  const json = await res.json();
  const accounts: any[] = [];

  for (const batch of json) {
    for (const row of batch.results ?? []) {
      const cc = row.customerClient;
      if (!cc) continue;
      const id = String(cc.id);
      const formatted = `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;
      const currency = cc.currencyCode === "BDT" ? "BDT" : "USD";

      accounts.push({
        ad_account_id: formatted,
        account_name: cc.descriptiveName ?? "",
        account_currency: currency,
        billing_type: "threshold_postpaid",
        threshold_limit: null,
        next_billing_date: null,
      });
    }
  }

  return accounts;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Check admin role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { integration_ids, preview, selected_accounts } = body;

    // Get user's org info for limits
    const { data: profileData } = await adminClient
      .from("profiles")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const orgId = profileData?.org_id;

    // Fetch org limits
    let maxAdAccounts: number | null = null;
    let currentAdAccountCount = 0;
    if (orgId) {
      const [{ data: orgData }, { data: countData }] = await Promise.all([
        adminClient.from("organizations").select("max_ad_accounts").eq("id", orgId).maybeSingle(),
        adminClient.from("ad_accounts").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("is_active", true),
      ]);
      maxAdAccounts = orgData?.max_ad_accounts ?? null;
      currentAdAccountCount = (countData as any)?.length ?? 0;
    }
    // Fix: use the count from the response properly
    if (orgId) {
      const { count } = await adminClient
        .from("ad_accounts")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("is_active", true);
      currentAdAccountCount = count ?? 0;
    }

    const limits = {
      max_ad_accounts: maxAdAccounts,
      current_count: currentAdAccountCount,
      remaining: maxAdAccounts !== null ? Math.max(0, maxAdAccounts - currentAdAccountCount) : null,
    };

    // Fetch selected integrations
    let query = adminClient.from("api_integrations").select("*").eq("is_active", true);
    if (integration_ids?.length) {
      query = query.in("id", integration_ids);
    }
    const { data: integrations, error: intError } = await query;
    if (intError) throw intError;

    if (!integrations?.length) {
      return new Response(
        JSON.stringify({ created: 0, skipped: 0, errors: [], message: "No active integrations found", limits }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing account IDs to mark as already imported (org-scoped to prevent cross-tenant false positives)
    let existingQuery = adminClient
      .from("ad_accounts")
      .select("id, ad_account_id, platform_name, account_name, account_currency, billing_type, threshold_limit, next_billing_date, current_threshold_spend, is_active, api_integration_id, org_id");
    if (orgId) {
      existingQuery = existingQuery.eq("org_id", orgId);
    }
    const { data: existingAccounts } = await existingQuery;

    const existingAccountMap = new Map(
      (existingAccounts ?? []).map((a: any) => [makeAccountKey(a.platform_name, a.ad_account_id), a])
    );
    const existingSet = new Set(existingAccountMap.keys());

    // Get TikTok proxy URL setting
    const { data: proxySetting } = await adminClient
      .from("settings").select("value").eq("key", "tiktok_proxy_url").maybeSingle();
    const tiktokProxyUrl = proxySetting?.value || null;
    const tiktokBase = tiktokProxyUrl ? tiktokProxyUrl.replace(/\/+$/, "") : "https://business-api.tiktok.com";

    // ── PREVIEW MODE: Discover accounts and return without inserting ──
    if (preview === true) {
      const discovered: any[] = [];
      const errors: string[] = [];
      const discovery_summary: string[] = [];

      for (const integration of integrations) {
        try {
          let platformAccounts: any[] = [];
          switch (integration.platform) {
            case "meta": {
              const meta = await fetchMetaAccounts(integration.app_id, integration.api_token);
              platformAccounts = meta.accounts;
              discovery_summary.push(
                `meta (${integration.instance_name ?? integration.id}): discovered owned=${meta.counts.owned}, partner=${meta.counts.partner}, partner_business=${meta.counts.partner_business}, system_user=${meta.counts.system_user}, merged=${meta.counts.merged}`,
              );
              for (const w of meta.warnings) {
                errors.push(`meta (${integration.instance_name ?? integration.id}): ${w}`);
              }
              break;
            }
            case "tiktok":
              platformAccounts = await fetchTikTokAccounts(integration.app_id, integration.api_token, tiktokBase);
              break;
            case "google":
              platformAccounts = await fetchGoogleAccounts(integration.app_id, integration.api_token);
              break;
            default:
              errors.push(`Unknown platform: ${integration.platform}`);
              continue;
          }

          for (const acc of platformAccounts) {
            const key = makeAccountKey(integration.platform, acc.ad_account_id);
            const existing = existingAccountMap.get(key) as any;
            discovered.push({
              ...acc,
              platform: integration.platform,
              integration_id: integration.id,
              integration_name: integration.instance_name || `${integration.platform} integration`,
              already_imported: !!existing,
              existing_id: existing?.id ?? null,
              existing_is_active: existing?.is_active ?? null,
              existing_api_integration_id: existing?.api_integration_id ?? null,
              import_status: !existing
                ? "new"
                : !existing.is_active
                  ? "inactive"
                  : existing.api_integration_id && existing.api_integration_id !== integration.id
                    ? "linked_elsewhere"
                    : "already_active",
            });
          }
        } catch (err: any) {
          errors.push(`${integration.platform} (${integration.instance_name ?? integration.id}): ${err.message}`);
        }
      }

      return new Response(
        JSON.stringify({ preview: true, discovered, errors, discovery_summary, limits }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── INSERT MODE: Import only selected accounts ──
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const newAccounts: any[] = [];
    const accountsToUpdate: { existing: any; account: any; integration: any }[] = [];

    if (selected_accounts && Array.isArray(selected_accounts) && selected_accounts.length > 0) {
      // Enforce limit check
      const newSelectedCount = selected_accounts.filter((account: any) => {
        const key = makeAccountKey(account.platform, account.ad_account_id);
        return !existingAccountMap.has(key);
      }).length;
      if (limits.remaining !== null && newSelectedCount > limits.remaining) {
        return new Response(
          JSON.stringify({
            error: `Cannot import ${newSelectedCount} new accounts. Only ${limits.remaining} more allowed by your plan (${limits.current_count}/${limits.max_ad_accounts} used). Existing accounts can still be updated/reactivated.`,
            limits,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Build a map of integration_id -> integration for quick lookup
      const integrationMap = new Map(integrations.map((i: any) => [i.id, i]));

      for (const account of selected_accounts) {
        const key = makeAccountKey(account.platform, account.ad_account_id);

        const integration = integrationMap.get(account.integration_id);
        if (!integration) {
          errors.push(`Integration not found for account ${account.ad_account_id}`);
          continue;
        }

        const existing = existingAccountMap.get(key) as any;
        if (existing) {
          accountsToUpdate.push({ existing, account, integration });
          continue;
        }

        newAccounts.push({
          ad_account_id: account.ad_account_id,
          account_name: account.account_name,
          platform_name: account.platform,
          api_integration_id: integration.id,
          billing_type: account.billing_type,
          threshold_limit: account.threshold_limit,
          next_billing_date: account.next_billing_date,
          current_threshold_spend: account.current_threshold_spend ?? 0,
          account_spending_limit: 250,
          is_active: true,
          account_currency: account.account_currency,
          org_id: orgId ?? integration.org_id ?? null,
        });
        existingSet.add(key);
      }

      for (const { existing, account, integration } of accountsToUpdate) {
        const updatePayload: any = {
          account_name: account.account_name || existing.account_name,
          api_integration_id: integration.id,
          billing_type: account.billing_type || existing.billing_type,
          threshold_limit: account.threshold_limit ?? existing.threshold_limit,
          next_billing_date: account.next_billing_date ?? existing.next_billing_date,
          current_threshold_spend: account.current_threshold_spend ?? existing.current_threshold_spend ?? 0,
          account_currency: account.account_currency || existing.account_currency,
          org_id: orgId ?? integration.org_id ?? existing.org_id ?? null,
        };
        if (!existing.is_active) updatePayload.is_active = true;

        const { error: updateError } = await adminClient
          .from("ad_accounts")
          .update(updatePayload)
          .eq("id", existing.id);
        if (updateError) {
          errors.push(`Failed to update ${account.ad_account_id}: ${updateError.message}`);
        } else {
          updated++;
        }
      }

      if (newAccounts.length > 0) {
        const { error: insertError } = await adminClient.from("ad_accounts").insert(newAccounts);
        if (insertError) throw insertError;
        created = newAccounts.length;
      }

      // Update last_synced_at for involved integrations
      const usedIntegrationIds = [
        ...new Set([
          ...newAccounts.map((a: any) => a.api_integration_id),
          ...accountsToUpdate.map((a) => a.integration.id),
        ]),
      ];
      for (const intId of usedIntegrationIds) {
        await adminClient
          .from("api_integrations")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", intId);
      }
    } else {
      // Legacy mode: import all (backwards compatible)
      for (const integration of integrations) {
        try {
          let platformAccounts: any[] = [];
          switch (integration.platform) {
            case "meta": {
              const meta = await fetchMetaAccounts(integration.app_id, integration.api_token);
              platformAccounts = meta.accounts;
              for (const w of meta.warnings) {
                errors.push(`meta (${integration.instance_name ?? integration.id}): ${w}`);
              }
              break;
            }
            case "tiktok":
              platformAccounts = await fetchTikTokAccounts(integration.app_id, integration.api_token, tiktokBase);
              break;
            case "google":
              platformAccounts = await fetchGoogleAccounts(integration.app_id, integration.api_token);
              break;
            default:
              errors.push(`Unknown platform: ${integration.platform}`);
              continue;
          }

          for (const account of platformAccounts) {
            const key = makeAccountKey(integration.platform, account.ad_account_id);
            const existing = existingAccountMap.get(key) as any;
            if (existing) {
              const updatePayload: any = {
                account_name: account.account_name || existing.account_name,
                api_integration_id: integration.id,
                billing_type: account.billing_type || existing.billing_type,
                threshold_limit: account.threshold_limit ?? existing.threshold_limit,
                next_billing_date: account.next_billing_date ?? existing.next_billing_date,
                current_threshold_spend: account.current_threshold_spend ?? existing.current_threshold_spend ?? 0,
                account_currency: account.account_currency || existing.account_currency,
                org_id: orgId ?? integration.org_id ?? existing.org_id ?? null,
              };
              if (!existing.is_active) updatePayload.is_active = true;
              const { error: updateError } = await adminClient
                .from("ad_accounts")
                .update(updatePayload)
                .eq("id", existing.id);
              if (updateError) {
                errors.push(`Failed to update ${account.ad_account_id}: ${updateError.message}`);
              } else {
                updated++;
              }
              skipped++;
              continue;
            }
            newAccounts.push({
              ad_account_id: account.ad_account_id,
              account_name: account.account_name,
              platform_name: integration.platform,
              api_integration_id: integration.id,
              billing_type: account.billing_type,
              threshold_limit: account.threshold_limit,
              next_billing_date: account.next_billing_date,
              current_threshold_spend: account.current_threshold_spend ?? 0,
              account_spending_limit: 250,
              is_active: true,
              account_currency: account.account_currency,
              org_id: orgId ?? integration.org_id ?? null,
            });
            existingSet.add(key);
            existingAccountMap.set(key, { ...account, platform_name: integration.platform, api_integration_id: integration.id, is_active: true });
          }

          await adminClient
            .from("api_integrations")
            .update({ last_synced_at: new Date().toISOString() })
            .eq("id", integration.id);
        } catch (err: any) {
          errors.push(`${integration.platform} (${integration.instance_name ?? integration.id}): ${err.message}`);
        }
      }

      if (newAccounts.length > 0) {
        const { error: insertError } = await adminClient.from("ad_accounts").insert(newAccounts);
        if (insertError) throw insertError;
        created = newAccounts.length;
      }
    }

    return new Response(
      JSON.stringify({ created, updated, skipped, errors, accounts: newAccounts, limits }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
