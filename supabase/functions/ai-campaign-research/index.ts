// AI Campaign Research — deep research stage.
// Input: { draft_id }
// Reads the draft + client + ad_account context, runs Lovable AI for
// product/audience/angles/competitor/platform-fit research, writes back
// research_json on the draft.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEARCH_TOOL = {
  type: "function",
  function: {
    name: "submit_research",
    description: "Submit deep research findings for a product to inform ad campaign creation.",
    parameters: {
      type: "object",
      properties: {
        product_summary: { type: "string", description: "1-2 sentence summary of the product and its primary value." },
        features: { type: "array", items: { type: "string" } },
        usp: { type: "string", description: "The single sharpest unique selling proposition." },
        price_signal: { type: "string", description: "Apparent price tier (e.g. premium, mid, budget). If unknown, write 'unknown'." },
        target_personas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              age_range: { type: "string" },
              gender: { type: "string", enum: ["all", "male", "female"] },
              interests: { type: "array", items: { type: "string" } },
              pain_points: { type: "array", items: { type: "string" } },
              buying_triggers: { type: "array", items: { type: "string" } },
            },
            required: ["label", "age_range", "gender", "interests", "pain_points", "buying_triggers"],
          },
        },
        angles: {
          type: "array",
          description: "5 distinct creative angles, ranked by predicted performance.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              short_hook: { type: "string" },
              reasoning: { type: "string" },
            },
            required: ["name", "short_hook", "reasoning"],
          },
        },
        competitors: { type: "array", items: { type: "string" }, description: "Likely competitor brands or substitutes." },
        positioning_gap: { type: "string", description: "Where the product can win versus competitors." },
        platform_fit: {
          type: "object",
          properties: {
            best_platform: { type: "string", enum: ["meta", "tiktok", "google"] },
            best_format: { type: "string" },
            reasoning: { type: "string" },
          },
          required: ["best_platform", "best_format", "reasoning"],
        },
        recommended_objective: { type: "string", enum: ["SALES", "LEADS", "TRAFFIC", "MESSAGES", "AWARENESS", "APP_INSTALLS"] },
      },
      required: ["product_summary", "features", "usp", "target_personas", "angles", "platform_fit", "recommended_objective"],
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

    const { data: draft, error: dErr } = await service
      .from("ai_campaign_drafts").select("*").eq("id", draft_id).maybeSingle();
    if (dErr || !draft) return j({ error: "Draft not found" }, 404);

    // Load context: client profile (keyword via ad_account_clients), ad_account
    const [{ data: client }, { data: account }, { data: mapping }] = await Promise.all([
      service.from("profiles").select("id, full_name, business_name, country, language").eq("id", draft.client_id).maybeSingle(),
      service.from("ad_accounts").select("id, platform_name, account_currency, account_name").eq("id", draft.ad_account_id).maybeSingle(),
      service.from("ad_account_clients").select("mapping_keyword").eq("ad_account_id", draft.ad_account_id).eq("client_id", draft.client_id).maybeSingle(),
    ]);

    await service.from("ai_campaign_drafts").update({ status: "researching" }).eq("id", draft_id);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return j({ error: "LOVABLE_API_KEY not configured" }, 500);

    const systemPrompt = `You are an elite performance-marketing strategist. Given a product brief, produce sharp, actionable research that will guide ad campaign creation on ${account?.platform_name?.toUpperCase() ?? "META"}. Be specific, opinionated and concise. Avoid generic advice.`;

    const userPrompt = `CLIENT: ${client?.business_name ?? client?.full_name ?? "Unknown"} (country: ${client?.country ?? "BD"}, language: ${client?.language ?? "en"})
AD ACCOUNT: ${account?.account_name ?? account?.id} on ${account?.platform_name ?? "meta"} (currency ${account?.account_currency ?? "USD"})
KEYWORD: ${mapping?.mapping_keyword ?? ""}

PRODUCT BRIEF:
${draft.product_brief || "(none provided)"}

PRODUCT URL: ${draft.product_url ?? "(none)"}

Please return your research via the submit_research tool.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [RESEARCH_TOOL],
        tool_choice: { type: "function", function: { name: "submit_research" } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      const status = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 500;
      const msg = status === 429 ? "Rate limit exceeded, please try again." : status === 402 ? "AI credits exhausted." : `AI gateway error: ${txt.slice(0,200)}`;
      await service.from("ai_campaign_drafts").update({ status: "failed", error: msg }).eq("id", draft_id);
      return j({ error: msg }, status);
    }

    const data = await aiResp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const research = toolCall ? safeParse(toolCall.function.arguments) : null;
    if (!research) {
      await service.from("ai_campaign_drafts").update({ status: "failed", error: "No structured research returned" }).eq("id", draft_id);
      return j({ error: "Model did not return structured research" }, 500);
    }

    await service.from("ai_campaign_drafts").update({
      research_json: research,
      status: "draft",
    }).eq("id", draft_id);

    return j({ ok: true, research });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function safeParse(s: string) { try { return JSON.parse(s); } catch { return null; } }
function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
