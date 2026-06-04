import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireCaller, requireRole, AuthError, corsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authenticated admin caller (or service-role) — this proxies an
    // external OAuth exchange and must not be a public anonymizing proxy.
    const ctx = await requireCaller(req);
    if (!ctx.isServiceCall) {
      requireRole(ctx, ["admin", "platform_owner"]);
    }

    const { auth_code, app_id, app_secret } = await req.json();
    if (!auth_code || !app_id || !app_secret) {
      throw new Error("auth_code, app_id, and app_secret are required");
    }

    const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id, secret: app_secret, auth_code }),
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
    if (err instanceof AuthError) {
      return new Response(JSON.stringify({ ok: false, message: err.message }),
        { status: err.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(
      JSON.stringify({ ok: false, message: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
