// AI Campaign Refine — conversational draft refinement.
// POST { draft_id, instruction } — uses the current draft_json + history,
// asks the model to apply the instruction, writes a new version.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// deno-lint-ignore no-explicit-any
type Any = any;

const REVISE_TOOL = {
  type: "function",
  function: {
    name: "revise_draft",
    description: "Apply the user's instruction to the current campaign draft and return the updated tree.",
    parameters: {
      type: "object",
      properties: {
        change_summary: { type: "string", description: "1-2 sentences explaining what changed." },
        updated_tree: { type: "object", description: "The full revised campaign tree, same shape as the original." },
      },
      required: ["change_summary", "updated_tree"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return j({ error: "Missing auth" }, 401);
    if (!LOVABLE_API_KEY) return j({ error: "LOVABLE_API_KEY not configured" }, 500);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return j({ error: "Unauthorized" }, 401);

    const { draft_id, instruction } = await req.json();
    if (!draft_id || !instruction?.trim()) return j({ error: "draft_id and instruction required" }, 400);

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: draft } = await service.from("ai_campaign_drafts").select("*").eq("id", draft_id).maybeSingle();
    if (!draft) return j({ error: "Draft not found" }, 404);
    if (!draft.draft_json) return j({ error: "No draft to refine yet" }, 400);

    const sys = `You are a senior media buyer iterating on a ${(draft.platform || "meta").toUpperCase()} campaign draft.
Apply the user's instruction precisely. Keep the SAME tree shape and the same keys. Preserve unrelated fields verbatim.
Do not change names unless explicitly asked. Return ONLY via revise_draft.`;

    const usr = `CURRENT DRAFT:
${JSON.stringify(draft.draft_json, null, 2)}

${draft.past_performance_json ? `PAST PERFORMANCE:\n${JSON.stringify(draft.past_performance_json, null, 2)}\n` : ""}
USER INSTRUCTION:
"""${instruction.trim()}"""`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
        tools: [REVISE_TOOL],
        tool_choice: { type: "function", function: { name: "revise_draft" } },
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 429) return j({ error: "Rate limit exceeded." }, 429);
      if (resp.status === 402) return j({ error: "AI credits exhausted." }, 402);
      return j({ error: `AI gateway error: ${text.slice(0, 180)}` }, 500);
    }
    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return j({ error: "Model returned no structured revision" }, 500);
    let parsed: Any;
    try { parsed = JSON.parse(call.function.arguments); } catch { return j({ error: "Bad tool args JSON" }, 500); }
    const tree = parsed.updated_tree;
    if (!tree?.campaign) return j({ error: "Revision missing campaign root" }, 500);

    const nextVersion = (draft.version || 1) + 1;
    await service.from("ai_campaign_drafts").update({
      draft_json: tree,
      version: nextVersion,
      status: "ready",
    }).eq("id", draft.id);
    await service.from("ai_campaign_draft_versions").insert({
      draft_id: draft.id,
      org_id: draft.org_id,
      version: nextVersion,
      draft_json: tree,
      edited_by: user.id,
      change_note: instruction.trim().slice(0, 240),
    });

    return j({ ok: true, version: nextVersion, change_summary: parsed.change_summary });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function j(body: Any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
