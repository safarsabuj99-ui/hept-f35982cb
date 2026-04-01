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

    // 1. Full recomputation — sum ALL purchases and ALL spend from source tables
    const [purchasesRes, spendRes] = await Promise.all([
      supabase.from("usd_purchases").select("usd_received"),
      supabase.from("daily_metrics").select("spend"),
    ]);

    if (purchasesRes.error) throw purchasesRes.error;
    if (spendRes.error) throw spendRes.error;

    const totalPurchased = (purchasesRes.data ?? []).reduce(
      (s: number, r: any) => s + Number(r.usd_received || 0), 0
    );
    const totalSpend = (spendRes.data ?? []).reduce(
      (s: number, r: any) => s + Number(r.spend || 0), 0
    );
    const balance = totalPurchased - totalSpend;

    // 2. 7-day burn rate
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

    // 3. Client obligations (all completed transactions)
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

    // 4. Build metrics object
    const metrics = {
      total_purchased: Math.round(totalPurchased * 100) / 100,
      total_spend: Math.round(totalSpend * 100) / 100,
      daily_burn: Math.round(dailyBurn * 100) / 100,
      runway_days: runwayDays,
      client_obligations: Math.round(clientObligations * 100) / 100,
      usd_needed: Math.round(usdNeeded * 100) / 100,
    };

    // 5. Upsert today's snapshot
    const now = new Date();
    const monthLabel = now.toLocaleDateString("en-US", {
      month: "long", year: "numeric", timeZone: "Asia/Dhaka",
    });
    const timestamp = now.toLocaleTimeString("en-US", { timeZone: "Asia/Dhaka" });

    const { error: upsertErr } = await supabase
      .from("usd_inventory_snapshots")
      .upsert(
        {
          snapshot_date: today,
          balance_usd: balance,
          metrics,
          notes: `Auto refresh — ${monthLabel} (${timestamp})`,
          created_by: "00000000-0000-0000-0000-000000000000",
        },
        { onConflict: "snapshot_date" }
      );

    if (upsertErr) throw upsertErr;

    console.log(`Auto snapshot upserted: $${balance.toFixed(2)} on ${today}`);

    return new Response(
      JSON.stringify({ success: true, balance, metrics, snapshot_date: today }),
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
