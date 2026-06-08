// AI Campaign Publish — push an approved/ready draft to the real ad platform.
// MVP: creates Campaign + Ad Sets on Meta (PAUSED). Ads are recorded but NOT
// created on the platform because they require an uploaded image/video creative
// that the AI brief alone cannot produce. The UI surfaces those as
// "needs_creative" so the user can finish them inside Ads Manager.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_VERSION = "v21.0";
const FB_GRAPH = `https://graph.facebook.com/${META_VERSION}`;

// Map our internal objective → Meta v21 OUTCOME_* objective + sensible optimization_goal/billing_event defaults
const META_OBJECTIVE_MAP: Record<string, { objective: string; optimization_goal: string; billing_event: string }> = {
  SALES:        { objective: "OUTCOME_SALES",        optimization_goal: "OFFSITE_CONVERSIONS", billing_event: "IMPRESSIONS" },
  LEADS:        { objective: "OUTCOME_LEADS",        optimization_goal: "LEAD_GENERATION",     billing_event: "IMPRESSIONS" },
  TRAFFIC:      { objective: "OUTCOME_TRAFFIC",      optimization_goal: "LINK_CLICKS",         billing_event: "LINK_CLICKS" },
  MESSAGES:     { objective: "OUTCOME_ENGAGEMENT",   optimization_goal: "CONVERSATIONS",       billing_event: "IMPRESSIONS" },
  AWARENESS:    { objective: "OUTCOME_AWARENESS",    optimization_goal: "REACH",               billing_event: "IMPRESSIONS" },
  APP_INSTALLS: { objective: "OUTCOME_APP_PROMOTION", optimization_goal: "APP_INSTALLS",       billing_event: "IMPRESSIONS" },
};

// Zero-decimal currencies don't multiply by 100 for Meta minor units
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF"]);

function toMinorUnits(amount: number, currency: string): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return ZERO_DECIMAL.has(currency.toUpperCase())
    ? Math.round(amount)
    : Math.round(amount * 100);
}

async function metaCreate(path: string, token: string, params: Record<string, any>) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  body.append("access_token", token);
  const res = await fetch(`${FB_GRAPH}${path}`, { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    const msg = json?.error?.error_user_msg || json?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Meta API ${path}: ${msg}`);
  }
  return json as { id: string };
}

async function metaDelete(id: string, token: string) {
  try {
    await fetch(`${FB_GRAPH}/${id}?access_token=${encodeURIComponent(token)}`, { method: "DELETE" });
  } catch {/* best-effort */}
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return j({ error: "Missing auth" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return j({ error: "Unauthorized" }, 401);

    const { draft_id } = await req.json();
    if (!draft_id) return j({ error: "draft_id required" }, 400);

    const { data: draft, error: dErr } = await service
      .from("ai_campaign_drafts").select("*").eq("id", draft_id).maybeSingle();
    if (dErr || !draft) return j({ error: "Draft not found" }, 404);
    if (!draft.draft_json) return j({ error: "Draft has no generated tree yet" }, 400);
    if (!["ready", "approved", "failed"].includes(draft.status)) {
      return j({ error: `Cannot publish from status '${draft.status}'` }, 409);
    }

    const { data: account } = await service
      .from("ad_accounts")
      .select("id, ad_account_id, platform_name, account_currency, api_integration_id, api_integrations!ad_accounts_api_integration_id_fkey(api_token, platform)")
      .eq("id", draft.ad_account_id).maybeSingle();
    if (!account) return j({ error: "Ad account not found" }, 404);

    const integration: any = (account as any).api_integrations;
    const token = integration?.api_token;
    if (!token) return j({ error: "Ad account is not connected to an API integration (missing token)" }, 400);

    const platform = String(account.platform_name).toLowerCase();
    if (platform !== "meta" && platform !== "facebook") {
      // Mark failed and return — TikTok / others not implemented in this MVP
      await service.from("ai_campaign_drafts").update({
        status: "failed",
        error: `Auto-publish for ${platform} is not yet supported. Only Meta is supported in this release.`,
      }).eq("id", draft_id);
      return j({ error: `Auto-publish for ${platform} is not yet supported yet (Meta only).` }, 400);
    }

    // Flip to publishing
    await service.from("ai_campaign_drafts").update({ status: "publishing", error: null }).eq("id", draft_id);

    const tree: any = draft.draft_json;
    const accountPath = account.ad_account_id.startsWith("act_") ? account.ad_account_id : `act_${account.ad_account_id}`;
    const currency = account.account_currency || "USD";

    const created: { type: string; id: string }[] = [];
    const publishResult: any = { campaign: null, ad_sets: [], ads: [] };

    const logRow = async (row: any) => {
      try { await service.from("ai_campaign_publish_logs").insert({ draft_id, org_id: draft.org_id, ...row }); } catch {}
    };

    try {
      // 1. CAMPAIGN
      const campIn = tree.campaign || {};
      const objKey = String(campIn.objective || draft.objective || "SALES").toUpperCase();
      const objMap = META_OBJECTIVE_MAP[objKey] || META_OBJECTIVE_MAP.SALES;

      const campaignParams: Record<string, any> = {
        name: campIn.name || `AI Draft ${draft.id.slice(0, 8)}`,
        objective: objMap.objective,
        status: "PAUSED",
        special_ad_categories: campIn.special_ad_categories?.length ? campIn.special_ad_categories : [],
        buying_type: campIn.buying_type || "AUCTION",
      };
      const campRes = await metaCreate(`/${accountPath}/campaigns`, token, campaignParams);
      created.push({ type: "campaign", id: campRes.id });
      publishResult.campaign = { id: campRes.id, name: campaignParams.name };
      await logRow({ node_type: "campaign", node_label: campaignParams.name, platform_id: campRes.id, request: campaignParams, response: campRes, status: "ok" });

      // 2. AD SETS
      const adSets = Array.isArray(tree.ad_sets) ? tree.ad_sets : [];
      for (const as of adSets) {
        const audience = as.audience || {};
        const targeting: any = {
          geo_locations: { countries: (audience.countries?.length ? audience.countries : ["US"]) },
          age_min: audience.age_min ?? 18,
          age_max: audience.age_max ?? 65,
        };
        if (audience.gender === "male") targeting.genders = [1];
        else if (audience.gender === "female") targeting.genders = [2];

        const dailyBudget = Number(campIn.daily_budget) || 10;
        const adSetParams: Record<string, any> = {
          name: as.name || `${campaignParams.name} | set`,
          campaign_id: campRes.id,
          status: "PAUSED",
          daily_budget: toMinorUnits(dailyBudget, currency),
          billing_event: objMap.billing_event,
          optimization_goal: as.optimization_goal || objMap.optimization_goal,
          targeting,
        };

        try {
          const asRes = await metaCreate(`/${accountPath}/adsets`, token, adSetParams);
          created.push({ type: "adset", id: asRes.id });
          publishResult.ad_sets.push({ id: asRes.id, name: adSetParams.name });
          await logRow({ node_type: "adset", node_label: adSetParams.name, platform_id: asRes.id, request: adSetParams, response: asRes, status: "ok" });

          // 3. ADS — recorded but NOT created (creative upload required by Meta)
          for (const ad of (as.ads || [])) {
            publishResult.ads.push({ name: ad.name, status: "needs_creative", reason: "Upload image/video in Ads Manager to finish this ad." });
            await logRow({ node_type: "ad", node_label: ad.name, status: "skipped", error: "Creative upload required — finish in Ads Manager." });
          }
        } catch (asErr) {
          await logRow({ node_type: "adset", node_label: adSetParams.name, request: adSetParams, status: "failed", error: (asErr as Error).message });
          throw asErr;
        }
      }

      await service.from("ai_campaign_drafts").update({
        status: "published",
        error: null,
        platform_ids: { campaign_id: campRes.id, ad_set_ids: publishResult.ad_sets.map((s: any) => s.id) },
        draft_json: { ...tree, publish_result: publishResult },
      }).eq("id", draft_id);

      return j({ ok: true, publish_result: publishResult });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // best-effort rollback in reverse order
      for (const node of [...created].reverse()) await metaDelete(node.id, token);
      await service.from("ai_campaign_drafts").update({ status: "failed", error: msg }).eq("id", draft_id);
      return j({ error: msg, rolled_back: created.length }, 500);
    }
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
