import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify caller identity
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabaseUser.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub;

    // Verify caller is admin
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { client_id, from_platform, to_platform, amount_usd } = await req.json();

    // Validate inputs
    const validPlatforms = ["meta", "tiktok", "google"];
    if (!client_id || !from_platform || !to_platform || !amount_usd) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!validPlatforms.includes(from_platform) || !validPlatforms.includes(to_platform)) {
      return new Response(JSON.stringify({ error: "Invalid platform" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (from_platform === to_platform) {
      return new Response(JSON.stringify({ error: "Source and destination must differ" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const usd = parseFloat(amount_usd);
    if (isNaN(usd) || usd <= 0) {
      return new Response(JSON.stringify({ error: "Amount must be positive" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch client pricing
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("pricing_config")
      .eq("user_id", client_id)
      .single();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pc = profile.pricing_config as any;
    const rates = pc?.flat_rates || pc?.platform_rates || {};
    const sourceRate = rates[from_platform];
    const destRate = rates[to_platform];

    if (!sourceRate || !destRate || sourceRate <= 0 || destRate <= 0) {
      return new Response(JSON.stringify({ error: "Platform rates not configured for this client" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate source platform balance
    const { data: txns } = await supabaseAdmin
      .from("transactions")
      .select("type, amount")
      .eq("client_id", client_id)
      .eq("platform", from_platform)
      .eq("status", "completed");

    const credits = (txns || []).filter((t: any) => t.type === "credit").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const debits = (txns || []).filter((t: any) => t.type === "debit").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const sourceBalance = credits - debits;

    if (usd > sourceBalance) {
      return new Response(
        JSON.stringify({ error: `Insufficient ${from_platform} balance. Available: $${sourceBalance.toFixed(2)}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Conversion
    const bdtAmount = usd * sourceRate;
    const destUsd = parseFloat((bdtAmount / destRate).toFixed(2));

    const description = `Platform transfer: ${from_platform} → ${to_platform} ($${usd} @ ৳${sourceRate} = ৳${bdtAmount.toFixed(0)} → $${destUsd} @ ৳${destRate})`;

    // Insert debit + credit
    const { error: debitErr } = await supabaseAdmin.from("transactions").insert({
      client_id,
      type: "debit",
      amount: usd,
      platform: from_platform,
      status: "completed",
      created_by: callerId,
      description,
    });

    if (debitErr) {
      return new Response(JSON.stringify({ error: "Failed to create debit: " + debitErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: creditErr } = await supabaseAdmin.from("transactions").insert({
      client_id,
      type: "credit",
      amount: destUsd,
      platform: to_platform,
      status: "completed",
      created_by: callerId,
      description,
    });

    if (creditErr) {
      return new Response(JSON.stringify({ error: "Failed to create credit: " + creditErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit log: platform transfer
    await supabaseAdmin.from("audit_logs").insert({
      user_id: callerId,
      action_type: "platform_transfer",
      description: `Transfer $${usd} from ${from_platform} → ${to_platform} (→ $${destUsd}) for client ${client_id}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        source_usd: usd,
        source_rate: sourceRate,
        bdt_amount: bdtAmount,
        dest_rate: destRate,
        dest_usd: destUsd,
        from_platform,
        to_platform,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
