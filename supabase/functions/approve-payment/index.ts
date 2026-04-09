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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin using their token
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role using service client
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleCheck } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { request_id, action, admin_note, selected_rate, received_in_account_id, platform_override } = await req.json();
    if (!request_id || !action || !["approved", "rejected"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the payment request
    const { data: pr, error: prErr } = await adminClient
      .from("payment_requests")
      .select("*")
      .eq("id", request_id)
      .eq("status", "pending")
      .single();

    if (prErr || !pr) {
      return new Response(
        JSON.stringify({ error: "Request not found or already processed" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "rejected") {
      await adminClient
        .from("payment_requests")
        .update({ status: "rejected", admin_note: admin_note || null })
        .eq("id", request_id);

      await adminClient.from("audit_logs").insert({
        user_id: user.id,
        action_type: "payment_rejected",
        description: `Rejected payment ৳${Number(pr.amount_bdt).toLocaleString()} from client ${pr.client_id}${admin_note ? ` — ${admin_note}` : ""}`,
      });

      return new Response(JSON.stringify({ success: true, action: "rejected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // APPROVED flow: determine exchange rate
    let exchangeRate: number;

    if (selected_rate && typeof selected_rate === "number" && selected_rate > 0) {
      exchangeRate = selected_rate;
    } else {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("pricing_config")
        .eq("user_id", pr.client_id)
        .single();

      const pricingConfig = profile?.pricing_config as any;
      const platformRates = pricingConfig?.flat_rates || pricingConfig?.platform_rates;
      exchangeRate = platformRates?.meta ? Number(platformRates.meta) : 120;
    }

    const totalBdt = Number(pr.amount_bdt);
    const finalUsd = Math.round((totalBdt / exchangeRate) * 100) / 100;

    // Update payment request
    const { error: updateErr } = await adminClient
      .from("payment_requests")
      .update({
        status: "approved",
        exchange_rate_snapshot: exchangeRate,
        final_amount_usd: finalUsd,
        admin_note: admin_note || null,
        received_in_account_id: received_in_account_id || null,
      })
      .eq("id", request_id)
      .eq("status", "pending");

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Failed to update request" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create transactions: per-platform if platform_amounts exists, else single
    const platformAmounts = pr.platform_amounts as Record<string, number> | null;
    const txDate = pr.payment_date || new Date().toISOString().split("T")[0];
    const transactions: any[] = [];

    if (platformAmounts && typeof platformAmounts === "object" && Object.keys(platformAmounts).length > 0) {
      // Multi-platform: create one transaction per platform entry
      const totalPlatformBdt = Object.values(platformAmounts).reduce((s: number, v: any) => s + Number(v), 0);

      for (const [platform, bdtAmount] of Object.entries(platformAmounts)) {
        const platformBdt = Number(bdtAmount);
        if (platformBdt <= 0) continue;
        const platformUsd = Math.round((platformBdt / exchangeRate) * 100) / 100;

        transactions.push({
          client_id: pr.client_id,
          type: "credit",
          amount: platformUsd,
          date: txDate,
          description: `Payment: ৳${platformBdt.toLocaleString()} via ${pr.payment_method} [${platform}] (Rate: ${exchangeRate})`,
          created_by: user.id,
          status: "completed",
          exchange_rate: exchangeRate,
          platform: platform,
        });
      }
    } else {
      // Legacy single-platform transaction
      transactions.push({
        client_id: pr.client_id,
        type: "credit",
        amount: finalUsd,
        date: txDate,
        description: `Payment: ৳${totalBdt.toLocaleString()} via ${pr.payment_method} (Rate: ${exchangeRate})`,
        created_by: user.id,
        status: "completed",
        exchange_rate: exchangeRate,
        platform: platform_override || pr.platform || null,
      });
    }

    const { error: txErr } = await adminClient.from("transactions").insert(transactions);

    if (txErr) {
      // Rollback
      await adminClient
        .from("payment_requests")
        .update({ status: "pending", exchange_rate_snapshot: null, final_amount_usd: null })
        .eq("id", request_id);

      return new Response(JSON.stringify({ error: "Failed to credit wallet, rolled back" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Credit agency account balance if specified
    if (received_in_account_id) {
      const { data: agencyAcc } = await adminClient
        .from("agency_accounts")
        .select("current_balance_bdt")
        .eq("id", received_in_account_id)
        .single();

      if (agencyAcc) {
        await adminClient
          .from("agency_accounts")
          .update({ current_balance_bdt: Number(agencyAcc.current_balance_bdt) + totalBdt })
          .eq("id", received_in_account_id);
      }
    }

    // Audit log
    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action_type: "payment_approved",
      description: `Approved payment ৳${totalBdt.toLocaleString()} → $${finalUsd} (Rate: ${exchangeRate}) for client ${pr.client_id}${platformAmounts ? ` [${Object.keys(platformAmounts).join(", ")}]` : ""}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        action: "approved",
        final_amount_usd: finalUsd,
        exchange_rate: exchangeRate,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
