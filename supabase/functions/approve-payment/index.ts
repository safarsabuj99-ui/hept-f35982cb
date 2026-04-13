import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return jsonRes({ error: "Unauthorized" }, 401);

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleCheck } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleCheck) return jsonRes({ error: "Forbidden: admin only" }, 403);

    const {
      request_id,
      action,
      admin_note,
      selected_rate,
      platform_rates,
      received_in_account_id,
      platform_override,
    } = await req.json();

    if (!request_id || !action || !["approved", "rejected"].includes(action)) {
      return jsonRes({ error: "Invalid params" }, 400);
    }

    // Fetch payment request
    const { data: pr, error: prErr } = await adminClient
      .from("payment_requests")
      .select("*")
      .eq("id", request_id)
      .eq("status", "pending")
      .single();

    if (prErr || !pr) {
      return jsonRes({ error: "Request not found or already processed" }, 404);
    }

    // --- REJECTED ---
    if (action === "rejected") {
      await adminClient
        .from("payment_requests")
        .update({ status: "rejected", admin_note: admin_note || null })
        .eq("id", request_id);

      await adminClient.from("audit_logs").insert({
        user_id: user.id,
        action_type: "payment_rejected",
        description: `Rejected payment ৳${Number(pr.amount_bdt).toLocaleString()} from client ${pr.client_id}${admin_note ? ` — ${admin_note}` : ""}`,
        org_id: pr.org_id,
      });

      return jsonRes({ success: true, action: "rejected" });
    }

    // --- APPROVED ---
    const platformAmounts = pr.platform_amounts as Record<string, number> | null;
    const isMultiPlatform =
      platformAmounts &&
      typeof platformAmounts === "object" &&
      Object.keys(platformAmounts).length > 0;

    const totalBdt = Number(pr.amount_bdt);
    const txDate = pr.payment_date || new Date().toISOString().split("T")[0];
    const transactions: any[] = [];
    let finalUsd = 0;
    let exchangeRateSnapshot: any;

    if (isMultiPlatform && platform_rates && typeof platform_rates === "object") {
      // Multi-platform with per-platform rates
      const rateMap: Record<string, number> = {};

      for (const [platform, bdtAmount] of Object.entries(platformAmounts)) {
        const platformBdt = Number(bdtAmount);
        if (platformBdt <= 0) continue;

        const rate = Number(platform_rates[platform]) || await getFallbackRate(adminClient, pr.client_id, platform);
        rateMap[platform] = rate;
        const platformUsd = Math.round((platformBdt / rate) * 100) / 100;
        finalUsd += platformUsd;

        transactions.push({
          client_id: pr.client_id,
          type: "credit",
          amount: platformUsd,
          date: txDate,
          description: `Payment: ৳${platformBdt.toLocaleString()} via ${pr.payment_method} [${platform}] (Rate: ${rate})`,
          created_by: user.id,
          status: "completed",
          exchange_rate: rate,
          platform: platform,
          org_id: pr.org_id,
        });
      }

      finalUsd = Math.round(finalUsd * 100) / 100;
      exchangeRateSnapshot = rateMap;
    } else if (isMultiPlatform) {
      // Multi-platform but no per-platform rates provided — use single rate fallback
      const fallbackRate = selected_rate && typeof selected_rate === "number" && selected_rate > 0
        ? selected_rate
        : await getFallbackRate(adminClient, pr.client_id, "meta");

      for (const [platform, bdtAmount] of Object.entries(platformAmounts)) {
        const platformBdt = Number(bdtAmount);
        if (platformBdt <= 0) continue;
        const platformUsd = Math.round((platformBdt / fallbackRate) * 100) / 100;
        finalUsd += platformUsd;

        transactions.push({
          client_id: pr.client_id,
          type: "credit",
          amount: platformUsd,
          date: txDate,
          description: `Payment: ৳${platformBdt.toLocaleString()} via ${pr.payment_method} [${platform}] (Rate: ${fallbackRate})`,
          created_by: user.id,
          status: "completed",
          exchange_rate: fallbackRate,
          platform: platform,
          org_id: pr.org_id,
        });
      }

      finalUsd = Math.round(finalUsd * 100) / 100;
      exchangeRateSnapshot = fallbackRate;
    } else {
      // Legacy single-platform
      const exchangeRate = selected_rate && typeof selected_rate === "number" && selected_rate > 0
        ? selected_rate
        : await getFallbackRate(adminClient, pr.client_id, "meta");

      finalUsd = Math.round((totalBdt / exchangeRate) * 100) / 100;
      exchangeRateSnapshot = exchangeRate;

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
        org_id: pr.org_id,
      });
    }

    // Update payment request — exchange_rate_snapshot is jsonb, wrap numeric as object
    const snapshotValue = typeof exchangeRateSnapshot === "number"
      ? exchangeRateSnapshot
      : exchangeRateSnapshot;

    const { error: updateErr } = await adminClient
      .from("payment_requests")
      .update({
        status: "approved",
        exchange_rate_snapshot: snapshotValue,
        final_amount_usd: finalUsd,
        admin_note: admin_note || null,
        received_in_account_id: received_in_account_id || null,
      })
      .eq("id", request_id)
      .eq("status", "pending");

    if (updateErr) {
      console.error("Update payment request error:", JSON.stringify(updateErr));
      return jsonRes({ error: "Failed to update request", details: updateErr.message }, 500);
    }

    // Insert transactions
    const { error: txErr } = await adminClient.from("transactions").insert(transactions);

    if (txErr) {
      await adminClient
        .from("payment_requests")
        .update({ status: "pending", exchange_rate_snapshot: null, final_amount_usd: null })
        .eq("id", request_id);
      return jsonRes({ error: "Failed to credit wallet, rolled back" }, 500);
    }

    // Credit agency account
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
    const platformInfo = isMultiPlatform
      ? ` [${Object.keys(platformAmounts).join(", ")}]`
      : platform_override ? ` [${platform_override}]` : "";

    const rateInfo = typeof exchangeRateSnapshot === "object"
      ? ` (Rates: ${Object.entries(exchangeRateSnapshot).map(([p, r]) => `${p}:${r}`).join(", ")})`
      : ` (Rate: ${exchangeRateSnapshot})`;

    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action_type: "payment_approved",
      description: `Approved payment ৳${totalBdt.toLocaleString()} → $${finalUsd}${rateInfo} for client ${pr.client_id}${platformInfo}`,
      org_id: pr.org_id,
    });

    return jsonRes({
      success: true,
      action: "approved",
      final_amount_usd: finalUsd,
      exchange_rate: exchangeRateSnapshot,
    });
  } catch (err) {
    return jsonRes({ error: String(err) }, 500);
  }
});

async function getFallbackRate(adminClient: any, clientId: string, platform: string): Promise<number> {
  const { data: profile } = await adminClient
    .from("profiles")
    .select("pricing_config")
    .eq("user_id", clientId)
    .single();

  const pricingConfig = profile?.pricing_config as any;
  const rates = pricingConfig?.flat_rates || pricingConfig?.platform_rates;
  if (rates && rates[platform]) return Number(rates[platform]);
  if (rates?.meta) return Number(rates.meta);
  return 120;
}
