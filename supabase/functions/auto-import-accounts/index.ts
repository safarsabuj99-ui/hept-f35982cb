import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Meta: fetch billing cycle data for a single ad account ──
async function fetchMetaBillingCycle(adAccountId: string, token: string) {
  try {
    const url = `https://graph.facebook.com/v21.0/${adAccountId}/adspaymentcycle?fields=threshold_amount,amount_spent,end_time&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const cycle = json.data?.[0];
    if (!cycle) return null;

    const thresholdLimit = cycle.threshold_amount ? Number(cycle.threshold_amount) / 100 : null;
    const currentSpend = cycle.amount_spent ? Number(cycle.amount_spent) / 100 : null;
    let nextBillingDate: string | null = null;
    if (cycle.end_time) {
      // end_time can be a Unix timestamp (number) or ISO string
      const d = typeof cycle.end_time === "number"
        ? new Date(cycle.end_time * 1000)
        : new Date(cycle.end_time);
      if (!isNaN(d.getTime())) {
        nextBillingDate = d.toISOString().split("T")[0];
      }
    }

    return { thresholdLimit, currentSpend, nextBillingDate };
  } catch {
    return null;
  }
}

// ── Meta: fetch owned ad accounts from Business Manager ──
async function fetchMetaAccounts(appId: string, token: string) {
  const url = `https://graph.facebook.com/v21.0/${appId}/owned_ad_accounts?fields=account_id,name,currency,funding_source_details,account_status&limit=500&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta API error: ${err}`);
  }
  const json = await res.json();
  const accounts: any[] = [];

  for (const acc of json.data ?? []) {
    // Determine billing type from funding_source_details
    let billingType = "prepaid";
    let thresholdLimit: number | null = null;
    let nextBillingDate: string | null = null;
    let currentThresholdSpend: number | null = null;

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

    // Map currency
    const currency = acc.currency === "BDT" ? "BDT" : "USD";
    const formattedId = acc.account_id?.replace(/^act_/, "") ? `act_${acc.account_id.replace(/^act_/, "")}` : acc.account_id;

    // Fetch billing cycle data from adspaymentcycle endpoint
    const billingCycle = await fetchMetaBillingCycle(formattedId, token);
    if (billingCycle) {
      // If we got billing cycle data, this is a threshold account
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

    accounts.push({
      ad_account_id: formattedId,
      account_name: acc.name ?? "",
      account_currency: currency,
      billing_type: billingType,
      threshold_limit: thresholdLimit,
      next_billing_date: nextBillingDate,
      current_threshold_spend: currentThresholdSpend ?? 0,
    });
  }

  return accounts;
}

// ── TikTok: discover advertisers from Business Center, then fetch details ──
async function fetchTikTokAccounts(appId: string, token: string, tiktokBase: string) {
  // appId = Business Center ID (BC ID)
  const bcId = appId.trim();
  if (!bcId) return [];

  // Step 1: Discover all advertiser IDs under the Business Center using /bc/asset/get/
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
    const bcJson = await bcRes.json();
    console.log("TikTok BC Asset response sample:", JSON.stringify(bcJson.data?.list?.[0] ?? "empty list"));
    if (bcJson.code !== 0) {
      throw new Error(`TikTok BC error: ${bcJson.message} (code ${bcJson.code})`);
    }

    const list = bcJson.data?.list ?? [];
    for (const item of list) {
      const advId = item.advertiser_id 
        || item.asset_id 
        || item.id
        || item.advertiser_info?.advertiser_id;
      if (advId) {
        advertiserIds.push(String(advId));
        advertiserNames.push(item.asset_name || item.advertiser_name || "");
      }
    }

    // Check if there are more pages
    const totalCount = bcJson.data?.page_info?.total_number ?? list.length;
    if (page * pageSize >= totalCount || list.length === 0) break;
    page++;
  }

  if (advertiserIds.length === 0) return [];

  console.log(`Building ${advertiserIds.length} TikTok accounts with enrichment from BC endpoints`);

  // Step 2a: Fetch advertiser details via BC endpoint (currency, name, status)
  const detailMap: Record<string, { currency: string; name: string }> = {};
  try {
    const detailUrl = `${tiktokBase}/open_api/v1.3/bc/advertiser/get/?bc_id=${bcId}&page=1&page_size=100`;
    console.log(`TikTok BC advertiser detail URL: ${detailUrl}`);
    const detailRes = await fetch(detailUrl, {
      headers: { "Access-Token": token, "Content-Type": "application/json" },
    });
    const detailJson = await detailRes.json();
    console.log(`TikTok BC advertiser detail response code: ${detailJson.code}`);
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
      console.log(`TikTok BC advertiser details fetched for ${Object.keys(detailMap).length} accounts`);
      if (detailJson.data.list.length > 0) {
        console.log(`TikTok BC advertiser detail sample: ${JSON.stringify(detailJson.data.list[0])}`);
      }
    } else {
      console.warn(`TikTok BC advertiser detail failed: ${detailJson.message || "unknown"}`);
    }
  } catch (e) {
    console.warn(`TikTok BC advertiser detail call failed (falling back to defaults): ${e.message}`);
  }

  // Step 2b: Fetch balances via BC endpoint
  const balanceMap: Record<string, { cash: number; grant: number }> = {};
  try {
    const idsParam = encodeURIComponent(JSON.stringify(advertiserIds));
    const balanceUrl = `${tiktokBase}/open_api/v1.3/advertiser/balance/get/?bc_id=${bcId}&advertiser_ids=${idsParam}`;
    console.log(`TikTok balance URL: ${balanceUrl}`);
    const balRes = await fetch(balanceUrl, {
      headers: { "Access-Token": token, "Content-Type": "application/json" },
    });
    const balJson = await balRes.json();
    console.log(`TikTok balance response code: ${balJson.code}`);
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
      console.log(`TikTok balances fetched for ${Object.keys(balanceMap).length} accounts`);
    } else {
      console.warn(`TikTok balance fetch failed: ${balJson.message || "unknown"}`);
    }
  } catch (e) {
    console.warn(`TikTok balance call failed (falling back to defaults): ${e.message}`);
  }

  // Step 3: Build enriched accounts with fallback
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
  // appId = manager customer ID (without dashes)
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

  // searchStream returns an array of result batches
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
        billing_type: "threshold_postpaid", // Google typically uses threshold billing
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

    // Verify caller
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
    const { integration_ids } = body;

    // Fetch selected integrations
    let query = adminClient.from("api_integrations").select("*").eq("is_active", true);
    if (integration_ids?.length) {
      query = query.in("id", integration_ids);
    }
    const { data: integrations, error: intError } = await query;
    if (intError) throw intError;

    if (!integrations?.length) {
      return new Response(
        JSON.stringify({ created: 0, skipped: 0, errors: [], message: "No active integrations found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing account IDs to deduplicate
    const { data: existingAccounts } = await adminClient
      .from("ad_accounts")
      .select("ad_account_id, platform_name");

    const existingSet = new Set(
      (existingAccounts ?? []).map((a: any) => `${a.platform_name}:${a.ad_account_id}`)
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    const newAccounts: any[] = [];

    for (const integration of integrations) {
      try {
        let discovered: any[] = [];

        switch (integration.platform) {
          case "meta":
            discovered = await fetchMetaAccounts(integration.app_id, integration.api_token);
            break;
          case "tiktok":
            discovered = await fetchTikTokAccounts(integration.app_id, integration.api_token);
            break;
          case "google":
            discovered = await fetchGoogleAccounts(integration.app_id, integration.api_token);
            break;
          default:
            errors.push(`Unknown platform: ${integration.platform}`);
            continue;
        }

        for (const account of discovered) {
          const key = `${integration.platform}:${account.ad_account_id}`;
          if (existingSet.has(key)) {
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
          });
          existingSet.add(key);
        }

        // Update last_synced_at
        await adminClient
          .from("api_integrations")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", integration.id);

      } catch (err: any) {
        errors.push(`${integration.platform} (${integration.instance_name ?? integration.id}): ${err.message}`);
      }
    }

    if (newAccounts.length > 0) {
      const { error: insertError } = await adminClient
        .from("ad_accounts")
        .insert(newAccounts);
      if (insertError) throw insertError;
      created = newAccounts.length;
    }

    return new Response(
      JSON.stringify({ created, skipped, errors, accounts: newAccounts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
