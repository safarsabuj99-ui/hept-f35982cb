import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date()
      .toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

    // 1. Find the latest manual baseline snapshot (opening balance / period close)
    //    These are snapshots created by users (not by the auto job "00000000-...")
    const { data: baselineSnap } = await supabase
      .from("usd_inventory_snapshots")
      .select("snapshot_date, balance_usd, created_by")
      .neq("created_by", "00000000-0000-0000-0000-000000000000")
      .order("snapshot_date", { ascending: false })
      .limit(1);

    const baseline = (baselineSnap as any[])?.[0] ?? null;
    const baselineDate = baseline?.snapshot_date ?? null;
    const carryForward = baseline ? Number(baseline.balance_usd) : 0;

    // 2. Sum purchases, ad spend, and manual spends SINCE baseline
    const purchaseQuery = supabase.from("usd_purchases").select("usd_received");
    const spendQuery = supabase.from("daily_metrics").select("spend");
    const manualSpendQuery = supabase.from("usd_manual_spends").select("amount_usd");

    if (baselineDate) {
      purchaseQuery.gt("date", baselineDate);
      spendQuery.gt("data_date", baselineDate);
      manualSpendQuery.gt("date", baselineDate);
    }

    const [purchasesRes, spendRes, manualSpendRes] = await Promise.all([
      purchaseQuery,
      spendQuery,
      manualSpendQuery,
    ]);

    if (purchasesRes.error) throw purchasesRes.error;
    if (spendRes.error) throw spendRes.error;
    if (manualSpendRes.error) throw manualSpendRes.error;

    const boughtSince = (purchasesRes.data ?? []).reduce(
      (s: number, r: any) => s + Number(r.usd_received || 0), 0
    );
    const spentSince = (spendRes.data ?? []).reduce(
      (s: number, r: any) => s + Number(r.spend || 0), 0
    );
    const manualSpend = (manualSpendRes.data ?? []).reduce(
      (s: number, r: any) => s + Number(r.amount_usd || 0), 0
    );

    const balance = carryForward + boughtSince - spentSince - manualSpend;

    // 3. 7-day burn rate
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    const { data: burn7, error: burnErr } = await supabase
      .from("daily_metrics")
      .select("spend")
      .gte("data_date", sevenDaysAgoStr);

    if (burnErr) throw burnErr;

    const last7Spend = (burn7 ?? []).reduce(
      (s: number, r: any) => s + Number(r.spend), 0
    );
    const dailyBurn = last7Spend / 7;
    const runwayDays = dailyBurn > 0
      ? Math.max(0, Math.floor(balance / dailyBurn))
      : balance > 0 ? 999 : 0;

    // 4. Client obligations (all completed transactions)
    const { data: txns, error: txnErr } = await supabase
      .from("transactions")
      .select("type, amount, client_id")
      .eq("status", "completed");

    if (txnErr) throw txnErr;

    const clientBalances: Record<string, number> = {};
    for (const t of (txns ?? []) as any[]) {
      const cid = t.client_id;
      if (!clientBalances[cid]) clientBalances[cid] = 0;
      clientBalances[cid] += t.type === "credit" ? Number(t.amount) : -Number(t.amount);
    }
    const clientObligations = Object.values(clientBalances)
      .filter((b) => b > 0)
      .reduce((s, b) => s + b, 0);
    const usdNeeded = Math.max(0, clientObligations - balance);

    // 5. Build metrics object
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const metrics = {
      carry_forward: r2(carryForward),
      bought_since: r2(boughtSince),
      spent_since: r2(spentSince),
      manual_spend: r2(manualSpend),
      total_purchased: r2(carryForward + boughtSince),
      total_spend: r2(spentSince),
      daily_burn: r2(dailyBurn),
      runway_days: runwayDays,
      client_obligations: r2(clientObligations),
      usd_needed: r2(usdNeeded),
      baseline_date: baselineDate,
    };

    // 6. Upsert today's snapshot
    const now = new Date();
    const monthLabel = now.toLocaleDateString("en-US", {
      month: "long", year: "numeric", timeZone: "Asia/Dhaka",
    });
    const timestamp = now.toLocaleTimeString("en-US", { timeZone: "Asia/Dhaka" });

    // Look up primary org_id for snapshot
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("id")
      .limit(1)
      .single();
    const snapshotOrgId = orgRow?.id || null;

    const { error: upsertErr } = await supabase
      .from("usd_inventory_snapshots")
      .upsert(
        {
          snapshot_date: today,
          balance_usd: r2(balance),
          metrics,
          notes: `Auto refresh — ${monthLabel} (${timestamp})`,
          created_by: "00000000-0000-0000-0000-000000000000",
          org_id: snapshotOrgId,
        },
        { onConflict: "snapshot_date" }
      );

    if (upsertErr) throw upsertErr;

    console.log(`Auto snapshot: $${balance.toFixed(2)} on ${today} | carry=$${carryForward} bought=$${boughtSince.toFixed(2)} spent=$${spentSince.toFixed(2)} manual=$${manualSpend.toFixed(2)} | baseline=${baselineDate ?? 'none'}`);

    return new Response(
      JSON.stringify({ success: true, balance: r2(balance), metrics, snapshot_date: today }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auto snapshot error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
