import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Helper to safely parse JSON from external API responses
  async function safeJson(response: Response): Promise<any> {
    const text = await response.text();
    try {
      return JSON.parse(text.trim());
    } catch {
      // Try to extract JSON from response
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
    const { integration_id } = await req.json();
    if (!integration_id) throw new Error("integration_id required");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: integration, error } = await supabaseAdmin
      .from("api_integrations")
      .select("*")
      .eq("id", integration_id)
      .single();

    if (error || !integration) throw new Error("Integration not found");

    const platform = integration.platform;
    const token = integration.api_token;
    const appId = integration.app_id;

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
      const res = await fetch(
        `https://business-api.tiktok.com/open_api/v1.3/bc/get/?bc_id=${bcId}`,
        { headers: { "Access-Token": token, "Content-Type": "application/json" } }
      );
      const data = await safeJson(res);
      if (data.code !== 0) {
        result = { ok: false, message: "Token invalid or BC ID incorrect", details: data.message };
      } else {
        const bcName = data.data?.bc_info?.name || data.data?.name || "N/A";
        const advRes = await fetch(
          `https://business-api.tiktok.com/open_api/v1.3/bc/advertiser/get/?bc_id=${bcId}&page_size=1`,
          { headers: { "Access-Token": token, "Content-Type": "application/json" } }
        );
        const advData = await safeJson(advRes);
        const advCount = advData.data?.page_info?.total_number ?? 0;
        result = {
          ok: true,
          message: `Connected to BC: "${bcName}"`,
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

    // Update connection_status in DB
    await supabaseAdmin
      .from("api_integrations")
      .update({ connection_status: result.ok ? "active" : "error" })
      .eq("id", integration_id);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, message: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
