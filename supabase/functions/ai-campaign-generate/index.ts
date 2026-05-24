// AI Campaign Generate — draft full Campaign → AdSet → Ads tree.
// Input: { draft_id, regenerate_node?: { path: string } }
// Uses research_json from the draft + client/account context to produce a
// structured campaign tree via tool calling. Writes draft_json on the draft
// and creates a snapshot in ai_campaign_draft_versions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CAMPAIGN_TOOL = {
  type: "function",
  function: {
    name: "submit_campaign",
    description: "Return a complete, ready-to-launch campaign structure.",
    parameters: {
      type: "object",
      properties: {
        campaign: {
          type: "object",
          properties: {
            name: { type: "string", description: "Use the exact naming convention provided." },
            objective: { type: "string", enum: ["SALES", "LEADS", "TRAFFIC", "MESSAGES", "AWARENESS", "APP_INSTALLS"] },
            daily_budget: { type: "number", description: "Daily budget in account currency." },
            buying_type: { type: "string", enum: ["AUCTION", "RESERVED"] },
            special_ad_categories: { type: "array", items: { type: "string" } },
            schedule_start: { type: "string", description: "ISO datetime or empty string." },
            schedule_end: { type: "string", description: "ISO datetime or empty string." },
          },
          required: ["name", "objective", "daily_budget"],
        },
        ad_sets: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              audience: {
                type: "object",
                properties: {
                  countries: { type: "array", items: { type: "string" } },
                  age_min: { type: "number" },
                  age_max: { type: "number" },
                  gender: { type: "string", enum: ["all", "male", "female"] },
                  interests: { type: "array", items: { type: "string" } },
                  custom_audiences: { type: "array", items: { type: "string" } },
                },
                required: ["countries", "age_min", "age_max", "gender", "interests"],
              },
              placements: { type: "string", enum: ["automatic", "feeds_only", "stories_reels", "manual"] },
              optimization_goal: { type: "string", description: "e.g. PURCHASE, LEAD_GENERATION, LINK_CLICKS, OFFSITE_CONVERSIONS, MESSAGES" },
              ads: {
                type: "array",
                minItems: 1,
                maxItems: 4,
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    format: { type: "string", enum: ["single_image", "single_video", "carousel", "collection"] },
                    primary_texts: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
                    headlines: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
                    description: { type: "string" },
                    cta: { type: "string", description: "e.g. SHOP_NOW, LEARN_MORE, SIGN_UP, ORDER_NOW, MESSAGE_PAGE" },
                    destination_url: { type: "string" },
                    utm_suffix: { type: "string" },
                    creative_brief: { type: "string", description: "Detailed brief a designer or generator can produce the image/video from." },
                    angle_used: { type: "string" },
                  },
                  required: ["name", "format", "primary_texts", "headlines", "cta", "destination_url", "creative_brief", "angle_used"],
                },
              },
            },
            required: ["name", "audience", "placements", "optimization_goal", "ads"],
          },
        },
        rationale: { type: "string", description: "Short explanation of structural choices for the human reviewer." },
      },
      required: ["campaign", "ad_sets", "rationale"],
    },
  },
};

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

    const { data: draft } = await service.from("ai_campaign_drafts").select("*").eq("id", draft_id).maybeSingle();
    if (!draft) return j({ error: "Draft not found" }, 404);
    if (!draft.research_json) return j({ error: "Run research first" }, 400);

    const [{ data: client }, { data: account }, { data: mapping }] = await Promise.all([
      service.from("profiles").select("id, user_id, full_name, business_name, country, language").eq("user_id", draft.client_id).maybeSingle(),
      service.from("ad_accounts").select("id, platform_name, account_currency, account_name").eq("id", draft.ad_account_id).maybeSingle(),
      service.from("ad_account_clients").select("mapping_keyword").eq("ad_account_id", draft.ad_account_id).eq("client_id", draft.client_id).maybeSingle(),
    ]);

    const keyword = (mapping?.mapping_keyword || client?.business_name || "client").trim();
    const productName = (draft.product_name || "product").trim();
    const objective = (draft.objective || "SALES").toUpperCase();
    const today = new Date();
    const datestamp = `${String(today.getFullYear()).slice(2)}${String(today.getMonth()+1).padStart(2,"0")}${String(today.getDate()).padStart(2,"0")}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return j({ error: "LOVABLE_API_KEY not configured" }, 500);

    const systemPrompt = `You are an elite performance-marketing campaign architect for ${account?.platform_name?.toUpperCase() ?? "META"}. Produce a launch-ready Campaign → Ad Set → Ads tree.

NAMING CONVENTION (MUST USE EXACTLY — DO NOT DEVIATE):
- Campaign: "${keyword} | ${productName} | ${objective} | ${datestamp}"
- Ad Set:   "${keyword} | ${productName} | {AUDIENCE_LABEL} | {PLACEMENT}"
- Ad:       "${keyword} | ${productName} | {FORMAT} | v{N}"
  Where {AUDIENCE_LABEL} is a 1-2 word persona tag, {PLACEMENT} is feeds/stories/reels/auto, {FORMAT} is image/video/carousel, and {N} is a sequential number (1, 2, 3…).

CAMPAIGN OBJECTIVE (LOCKED): The campaign.objective field MUST be exactly "${objective}". Do not change it.

RULES:
- Daily budget should be sensible for ${account?.account_currency ?? "USD"} and the audience size. Default 10-25 ${account?.account_currency ?? "USD"}/day unless brief justifies more.
- Use the strongest 1-2 angles from research as separate ad sets only when targeting differs; otherwise produce ads variants under one ad set.
- Primary texts: 80-150 chars, scroll-stopping hook first. Headlines: <= 40 chars.
- Pick CTA that matches objective. URLs include utm_suffix with utm_source/medium/campaign.
- All copy in ${client?.language ?? "en"}. Stay culturally relevant for ${client?.country ?? "BD"}.
- Return ONLY via the submit_campaign tool.`;

    const userPrompt = `RESEARCH:
${JSON.stringify(draft.research_json, null, 2)}

PRODUCT BRIEF:
${draft.product_brief}

PRODUCT URL: ${draft.product_url ?? "(none)"}

Produce the campaign tree now.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [CAMPAIGN_TOOL],
        tool_choice: { type: "function", function: { name: "submit_campaign" } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      const status = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 500;
      const msg = status === 429 ? "Rate limit exceeded." : status === 402 ? "AI credits exhausted." : `AI gateway error: ${txt.slice(0,200)}`;
      await service.from("ai_campaign_drafts").update({ status: "failed", error: msg }).eq("id", draft_id);
      return j({ error: msg }, status);
    }

    const data = await aiResp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const tree = toolCall ? safeParse(toolCall.function.arguments) : null;
    if (!tree) {
      await service.from("ai_campaign_drafts").update({ status: "failed", error: "No structured tree returned" }).eq("id", draft_id);
      return j({ error: "Model did not return structured tree" }, 500);
    }

    const nextVersion = (draft.version || 1) + (draft.draft_json ? 1 : 0);

    await service.from("ai_campaign_drafts").update({
      draft_json: tree,
      status: "ready",
      version: nextVersion,
    }).eq("id", draft_id);

    await service.from("ai_campaign_draft_versions").insert({
      draft_id,
      org_id: draft.org_id,
      version: nextVersion,
      draft_json: tree,
      edited_by: user.id,
      change_note: "AI generated",
    });

    return j({ ok: true, draft_json: tree, version: nextVersion });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function safeParse(s: string) { try { return JSON.parse(s); } catch { return null; } }
function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
