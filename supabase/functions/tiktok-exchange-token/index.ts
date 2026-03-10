import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { auth_code, app_id, app_secret } = await req.json();
    if (!auth_code || !app_id || !app_secret) {
      throw new Error("auth_code, app_id, and app_secret are required");
    }

    // Exchange auth_code for access token
    const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: app_id,
        secret: app_secret,
        auth_code: auth_code,
      }),
    });

    const data = await res.json();

    if (data.code !== 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          message: data.message || "Token exchange failed",
          details: `Error code: ${data.code}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenData = data.data;
    // Calculate expiry date (TikTok tokens are typically valid for 365 days)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 365);

    return new Response(
      JSON.stringify({
        ok: true,
        access_token: tokenData.access_token,
        advertiser_ids: tokenData.advertiser_ids ?? [],
        scope: tokenData.scope ?? [],
        expiry_date: expiryDate.toISOString().split("T")[0],
        message: `Token obtained. ${(tokenData.advertiser_ids ?? []).length} advertiser(s) authorized.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, message: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
