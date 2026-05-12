import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireCaller,
  requireRole,
  requireRowOrgAccess,
} from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Helper to safely parse JSON from external API responses
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

  try {
    const ctx = await requireCaller(req);
    requireRole(ctx, ["admin", "platform_owner"]);

    const { integration_id } = await req.json();
    if (!integration_id) return jsonResponse({ ok: false, message: "integration_id required" }, 400);

    await requireRowOrgAccess(ctx, "api_integrations", "id", integration_id);
    const supabaseAdmin = ctx.supabaseAdmin;

    const { data: integration, error } = await supabaseAdmin
      .from("api_integrations")
      .select("*")
      .eq("id", integration_id)
      .single();
    if (error || !integration) throw new Error("Integration not found");

    const platform = integration.platform;
    const token = integration.api_token;
    const appId = integration.app_id;

    const { data: proxySetting } = await supabaseAdmin
      .from("settings").select("value").eq("key", "tiktok_proxy_url").maybeSingle();
    const tiktokProxyUrl = proxySetting?.value || null;
    const tiktokBase = tiktokProxyUrl ? tiktokProxyUrl.replace(/\/+$/, "") : "https://business-api.tiktok.com";

    let result: { ok: boolean; message: string; details?: string } = { ok: false, message: "Unknown platform" };

    if (platform === "meta") {
      const res = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${token}`);
      const data = await safeJson(res);
      if (data.error) {
        result = { ok: false, message: "Token invalid or expired", details: data.error.message };
      } else {
        const bizRes = await fetch(`https://graph.facebook.com/v21.0/me/businesses?fields=id,name&access_token=${token}`);
        const bizData = await safeJson(bizRes);
        const bizCount = bizData.data?.length ?? 0;
        result = {
          ok: true,
          message: `Connected as "${data.name}" (ID: ${data.id})`,
          details: `${bizCount} business portfolio(s) accessible`,
        };
      }
    } else if (platform === "tiktok") {
      const bcId = appId;
      const advRes = await fetch(
        `${tiktokBase}/open_api/v1.3/bc/asset/get/?bc_id=${bcId}&asset_type=ADVERTISER&page_size=1`,
        { headers: { "Access-Token": token, "Content-Type": "application/json" } }
      );
      const advData = await safeJson(advRes);
      if (advData.code !== 0) {
        result = { ok: false, message: "Token invalid or BC ID incorrect", details: advData.message };
      } else {
        const advCount = advData.data?.page_info?.total_number ?? advData.data?.list?.length ?? 0;
        result = {
          ok: true,
          message: `Connected to BC "${bcId}"`,
          details: `${advCount} advertiser account(s) accessible`,
        };
      }
    } else if (platform === "google") {
      const res = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
      if (res.ok) {
        const data = await safeJson(res);
        result = {
          ok: true,
          message: `Token valid`,
          details: `Scopes: ${data.scope || "N/A"}`,
        };
      } else {
        result = {
          ok: false,
          message: "Token may be expired or invalid",
          details: "Google Ads requires OAuth refresh tokens. Ensure token is current.",
        };
      }
    }

    await supabaseAdmin
      .from("api_integrations")
      .update({ connection_status: result.ok ? "active" : "error" })
      .eq("id", integration_id);

    return jsonResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});
