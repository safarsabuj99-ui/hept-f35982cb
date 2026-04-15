import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Helper: fetch ALL rows from a table, paginating past the 1000-row server limit
async function fetchAll(
  supabase: any,
  table: string,
  selectCols: string,
  filters?: (q: any) => any,
) {
  const PAGE = 1000;
  let allRows: any[] = [];
  let offset = 0;
  while (true) {
    let q = supabase.from(table).select(selectCols);
    if (filters) q = filters(q);
    q = q.range(offset, offset + PAGE - 1);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return allRows;
}

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
    const { data: baselineSnap } = await supabase
      .from("usd_inventory_snapshots")
      .select("snapshot_date, balance_usd, baseline_balance_usd, created_by")
      .neq("created_by", "00000000-0000-0000-0000-000000000000")
      .order("snapshot_date", { ascending: false })
      .limit(1);

    const baseline = (baselineSnap as any[])?.[0] ?? null;
    const baselineDate = baseline?.snapshot_date ?? null;
    // Use the immutable baseline field; fall back to balance_usd for old rows
    const carryForward = baseline
      ? Number(baseline.baseline_balance_usd ?? baseline.balance_usd)
      : 0;

    // 2. Sum purchases, ad spend, and manual spends SINCE baseline (paginated)
    const purchaseFilter = baselineDate
      ? (q: any) => q.gte("date", baselineDate)
      : undefined;
    const spendFilter = baselineDate
      ? (q: any) => q.gte("data_date", baselineDate)
      : undefined;
    const manualFilter = baselineDate
      ? (q: any) => q.gte("date", baselineDate)
      : undefined;

    const [purchases, spendRows, manualRows] = await Promise.all([
      fetchAll(supabase, "usd_purchases", "usd_received", purchaseFilter),
      fetchAll(supabase, "daily_metrics", "spend", spendFilter),
      fetchAll(supabase, "usd_manual_spends", "amount_usd", manualFilter),
    ]);

    const boughtSince = purchases.reduce(
      (s: number, r: any) => s + Number(r.usd_received || 0), 0
    );
    const spentSince = spendRows.reduce(
      (s: number, r: any) => s + Number(r.spend || 0), 0
    );
    const manualSpend = manualRows.reduce(
      (s: number, r: any) => s + Number(r.amount_usd || 0), 0
    );

    const balance = carryForward + boughtSince - spentSince - manualSpend;

    // 3. 7-day burn rate
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    const burn7 = await fetchAll(
      supabase, "daily_metrics", "spend",
      (q: any) => q.gte("data_date", sevenDaysAgoStr),
    );

    const last7Spend = burn7.reduce(
      (s: number, r: any) => s + Number(r.spend), 0
    );
    const dailyBurn = last7Spend / 7;
    const runwayDays = dailyBurn > 0
      ? Math.max(0, Math.floor(balance / dailyBurn))
      : balance > 0 ? 999 : 0;

    // 4. Client obligations (all completed transactions — paginated)
    const txns = await fetchAll(
      supabase, "transactions", "type, amount, client_id",
      (q: any) => q.eq("status", "completed"),
    );

    const clientBalancesMap: Record<string, number> = {};
    for (const t of txns as any[]) {
      const cid = t.client_id;
      if (!clientBalancesMap[cid]) clientBalancesMap[cid] = 0;
      clientBalancesMap[cid] += t.type === "credit" ? Number(t.amount) : -Number(t.amount);
    }

    // Get positive-balance client IDs for obligation breakdown
    const positiveClientIds = Object.entries(clientBalancesMap)
      .filter(([, b]) => b > 0)
      .map(([cid]) => cid);

    const clientObligations = positiveClientIds.reduce(
      (s, cid) => s + clientBalancesMap[cid], 0
    );
    const usdNeeded = Math.max(0, clientObligations - balance);

    // 5. Build metrics object
    const r2 = (n: number) => Math.round(n * 100) / 100;

    // Fetch client names for the breakdown
    let clientBalancesArray: { client_id: string; full_name: string; balance: number }[] = [];
    if (positiveClientIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", positiveClientIds);

      const nameMap: Record<string, string> = {};
      for (const p of (profileRows as any[]) ?? []) {
        nameMap[p.user_id] = p.full_name || "Unknown";
      }

      clientBalancesArray = positiveClientIds
        .map((cid) => ({
          client_id: cid,
          full_name: nameMap[cid] || "Unknown",
          balance: r2(clientBalancesMap[cid]),
        }))
        .sort((a, b) => b.balance - a.balance);
    }

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
      client_balances: clientBalancesArray,
    };

    // 6. Check if today already has a manual baseline — never overwrite it
    const { data: todaySnap } = await supabase
      .from("usd_inventory_snapshots")
      .select("created_by")
      .eq("snapshot_date", today)
      .limit(1);

    const isManualToday = (todaySnap as any[])?.[0]?.created_by &&
      (todaySnap as any[])[0].created_by !== "00000000-0000-0000-0000-000000000000";

    const now = new Date();
    const monthLabel = now.toLocaleDateString("en-US", {
      month: "long", year: "numeric", timeZone: "Asia/Dhaka",
    });
    const timestamp = now.toLocaleTimeString("en-US", { timeZone: "Asia/Dhaka" });

    if (isManualToday) {
      const { error: metricErr } = await supabase
        .from("usd_inventory_snapshots")
        .update({ metrics, balance_usd: r2(balance), notes: `Manual baseline — metrics refreshed (${timestamp})` })
        .eq("snapshot_date", today);
      if (metricErr) throw metricErr;
      console.log(`Updated metrics on manual baseline (${today})`);
    } else {

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
    }

    console.log(`Auto snapshot: $${balance.toFixed(2)} on ${today} | rows: purchases=${purchases.length} spend=${spendRows.length} manual=${manualRows.length} txns=${txns.length} | carry=$${carryForward} bought=$${boughtSince.toFixed(2)} spent=$${spentSince.toFixed(2)} manual=$${manualSpend.toFixed(2)} | baseline=${baselineDate ?? 'none'}`);

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
