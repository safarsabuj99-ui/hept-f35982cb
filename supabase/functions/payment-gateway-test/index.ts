import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResp(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // AuthN: must be platform_owner
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonResp({ ok: false, error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (!claims?.claims?.sub) return jsonResp({ ok: false, error: "Unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: roleRow } = await admin.from("user_roles").select("role")
    .eq("user_id", claims.claims.sub).eq("role", "platform_owner").maybeSingle();
  if (!roleRow) return jsonResp({ ok: false, error: "Forbidden — platform owner only" }, 403);

  try {
    const { gateway_id } = await req.json();
    const { data: gw, error } = await admin
      .from("platform_payment_gateways")
      .select("*")
      .eq("id", gateway_id)
      .single();
    if (error || !gw) return jsonResp({ ok: false, error: "Gateway not found" }, 404);

    const result = await testGateway(gw);

    await admin.from("platform_payment_gateways").update({
      last_tested_at: new Date().toISOString(),
      last_test_status: result.ok ? "ok" : "failed",
    }).eq("id", gateway_id);

    return jsonResp(result, result.ok ? 200 : 400);
  } catch (err: any) {
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});

async function testGateway(gw: any): Promise<{ ok: boolean; error?: string; details?: any }> {
  const creds = gw.credentials || {};
  const isSandbox = gw.mode === "sandbox";

  switch (gw.gateway) {
    case "sslcommerz": {
      if (!creds.store_id || !creds.store_password) return { ok: false, error: "Missing credentials" };
      // Use the session endpoint with $0 dry-run won't work; instead validate creds via the validator API
      const baseUrl = isSandbox ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";
      const form = new URLSearchParams({
        store_id: creds.store_id,
        store_passwd: creds.store_password,
        total_amount: "10",
        currency: "BDT",
        tran_id: `TEST-${Date.now()}`,
        success_url: "https://example.com/success",
        fail_url: "https://example.com/fail",
        cancel_url: "https://example.com/cancel",
        cus_name: "Test", cus_email: "t@example.com", cus_phone: "01700000000",
        cus_add1: "Dhaka", cus_city: "Dhaka", cus_country: "Bangladesh",
        shipping_method: "NO", product_name: "Test", product_category: "Test",
        product_profile: "non-physical-goods",
      });
      const resp = await fetch(`${baseUrl}/gwprocess/v4`, { method: "POST", body: form });
      const r = await resp.json();
      if (r.status === "SUCCESS") return { ok: true };
      return { ok: false, error: r.failedreason || "Auth failed", details: r };
    }
    case "stripe": {
      if (!creds.secret_key) return { ok: false, error: "Missing secret key" };
      const resp = await fetch("https://api.stripe.com/v1/balance", {
        headers: { "Authorization": `Bearer ${creds.secret_key}` },
      });
      const r = await resp.json();
      if (resp.ok) return { ok: true };
      return { ok: false, error: r.error?.message || "Auth failed" };
    }
    case "manual":
      return { ok: true };
    default:
      return { ok: false, error: `Test for ${gw.gateway} not implemented yet` };
  }
}
