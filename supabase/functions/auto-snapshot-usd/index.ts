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

    // 1. Get latest snapshot
    const { data: snapshots, error: snapErr } = await supabase
      .from("usd_inventory_snapshots")
      .select("*")
      .order("snapshot_date", { ascending: false })
      .limit(1);

    if (snapErr) throw snapErr;

    const snapshot = snapshots?.[0] ?? null;
    const carryForward = snapshot ? Number(snapshot.balance_usd) : 0;
    const sinceDate = snapshot?.snapshot_date ?? "2020-01-01";

    // 2. Sum purchases since snapshot
    const { data: purchases, error: purErr } = await supabase
      .from("usd_purchases")
      .select("usd_received")
      .gt("date", sinceDate);

    if (purErr) throw purErr;

    // 3. Sum spend since snapshot
    const { data: spend, error: spendErr } = await supabase
      .from("daily_metrics")
      .select("spend")
      .gt("data_date", sinceDate);

    if (spendErr) throw spendErr;

    const bought = (purchases ?? []).reduce(
      (s: number, r: any) => s + Number(r.usd_received),
      0
    );
    const spent = (spend ?? []).reduce(
      (s: number, r: any) => s + Number(r.spend),
      0
    );
    const balance = carryForward + bought - spent;

    // 4. Today's date in Asia/Dhaka
    const today = new Date()
      .toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

    const now = new Date();
    const monthLabel = now.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "Asia/Dhaka",
    });

    // 5. Insert new snapshot
    const { error: insertErr } = await supabase
      .from("usd_inventory_snapshots")
      .insert({
        snapshot_date: today,
        balance_usd: balance,
        notes: `Auto monthly close — ${monthLabel}`,
        created_by: "00000000-0000-0000-0000-000000000000",
      });

    if (insertErr) throw insertErr;

    console.log(
      `Auto snapshot created: $${balance.toFixed(2)} on ${today}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        balance,
        snapshot_date: today,
      }),
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
