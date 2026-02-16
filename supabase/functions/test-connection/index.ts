import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
      // Test Meta token by fetching user info
      const res = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${token}`);
      const data = await res.json();
      if (data.error) {
        result = { ok: false, message: "Token invalid or expired", details: data.error.message };
      } else {
        // Also try to list business portfolios
        const bizRes = await fetch(`https://graph.facebook.com/v21.0/me/businesses?fields=id,name&access_token=${token}`);
        const bizData = await bizRes.json();
        const bizCount = bizData.data?.length ?? 0;
        result = {
          ok: true,
          message: `Connected as "${data.name}" (ID: ${data.id})`,
          details: `${bizCount} business portfolio(s) accessible`,
        };
      }
    } else if (platform === "tiktok") {
      // Test TikTok token
      const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/user/info/", {
        headers: { "Access-Token": token },
      });
      const data = await res.json();
      if (data.code !== 0) {
        result = { ok: false, message: "Token invalid", details: data.message };
      } else {
        result = {
          ok: true,
          message: `Connected to TikTok Business`,
          details: `Display name: ${data.data?.display_name || "N/A"}`,
        };
      }
    } else if (platform === "google") {
      // Test Google Ads - use the token as a refresh token to get accessible customers
      // For now, test with a simple OAuth token info check
      const res = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
      if (res.ok) {
        const data = await res.json();
        result = {
          ok: true,
          message: `Token valid`,
          details: `Scopes: ${data.scope || "N/A"}`,
        };
      } else {
        // Try as developer token with customer ID in app_id
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
