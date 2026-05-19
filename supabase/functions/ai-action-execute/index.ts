// Nova — execute a pending action proposal AFTER the user has approved it.
// Reads ai_pending_actions, routes by tool_name, performs the safe mutation,
// and updates the row with status / result.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = {
  id: string;
  org_id: string;
  user_id: string;
  tool_name: string;
  args: Record<string, any>;
  summary: string;
  status: string;
};

async function executeAction(action: Action, service: any): Promise<{ ok: boolean; result?: any; error?: string }> {
  const { tool_name, args, org_id } = action;
  try {
    switch (tool_name) {
      case "campaign.pause": {
        if (!args.campaign_id) return { ok: false, error: "campaign_id required" };
        const { error } = await service
          .from("campaigns")
          .update({ status: "paused", updated_at: new Date().toISOString() })
          .eq("id", args.campaign_id)
          .eq("org_id", org_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { campaign_id: args.campaign_id, new_status: "paused" } };
      }

      case "campaign.resume": {
        if (!args.campaign_id) return { ok: false, error: "campaign_id required" };
        const { error } = await service
          .from("campaigns")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("id", args.campaign_id)
          .eq("org_id", org_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { campaign_id: args.campaign_id, new_status: "active" } };
      }

      case "client.topup_reminder":
      case "client.whatsapp_message":
      case "client.email_message":
      case "creative.refresh_brief":
      case "expense.log":
      default: {
        // Handoff actions — we record the approved payload so the human
        // can copy/paste or a future executor can ship it. Returning ok=true
        // means the proposal is "filed", not necessarily delivered externally.
        return { ok: true, result: { handoff: true, payload: args, note: "Approved & filed. Use the payload to ship from the relevant channel." } };
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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

    const body = await req.json();
    const proposalId: string = body.proposal_id;
    const decision: "approve" | "reject" = body.decision || "approve";
    if (!proposalId) return j({ error: "proposal_id required" }, 400);

    const { data: action, error: loadErr } = await service
      .from("ai_pending_actions")
      .select("*")
      .eq("id", proposalId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (loadErr || !action) return j({ error: "Proposal not found" }, 404);
    if (action.status !== "pending") return j({ error: `Already ${action.status}` }, 409);

    if (decision === "reject") {
      await service.from("ai_pending_actions").update({
        status: "rejected",
        decided_at: new Date().toISOString(),
      }).eq("id", proposalId);
      return j({ ok: true, status: "rejected" });
    }

    // approve → mark approved, execute, update result
    await service.from("ai_pending_actions").update({
      status: "approved",
      decided_at: new Date().toISOString(),
    }).eq("id", proposalId);

    const exec = await executeAction(action as Action, service);
    await service.from("ai_pending_actions").update({
      status: exec.ok ? "executed" : "failed",
      result: exec.result ?? null,
      error: exec.error ?? null,
      executed_at: new Date().toISOString(),
    }).eq("id", proposalId);

    return j({ ok: exec.ok, status: exec.ok ? "executed" : "failed", result: exec.result, error: exec.error });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
