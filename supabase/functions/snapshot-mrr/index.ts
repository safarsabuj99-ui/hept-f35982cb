import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Get current month first day
  const now = new Date();
  const snapshotMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  // Get all active subscriptions
  const { data: subs } = await supabase
    .from("organization_subscriptions")
    .select("org_id, plan, amount_bdt, billing_cycle, payment_status");

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, status");

  const activeOrgIds = new Set((orgs ?? []).filter((o: any) => o.status === "active" || o.status === "trial").map((o: any) => o.id));
  const activeSubs = (subs ?? []).filter((s: any) => activeOrgIds.has(s.org_id));

  const totalMrr = activeSubs.reduce((sum: number, s: any) => {
    const monthly = s.billing_cycle === "yearly" ? s.amount_bdt / 12 : s.amount_bdt;
    return sum + monthly;
  }, 0);

  // Get previous snapshot for delta calculations
  const { data: prevSnaps } = await supabase
    .from("mrr_snapshots")
    .select("*")
    .lt("snapshot_month", snapshotMonth)
    .order("snapshot_month", { ascending: false })
    .limit(1);

  const prev = prevSnaps?.[0];
  const prevMrr = prev?.total_mrr ?? 0;
  const newMrr = Math.max(0, totalMrr - prevMrr);
  const churnedMrr = Math.max(0, prevMrr - totalMrr);

  // Upsert snapshot
  const { error } = await supabase
    .from("mrr_snapshots")
    .upsert({
      snapshot_month: snapshotMonth,
      total_mrr: Math.round(totalMrr),
      new_mrr: Math.round(newMrr),
      churned_mrr: Math.round(churnedMrr),
      expansion_mrr: 0,
      contraction_mrr: 0,
      active_count: activeOrgIds.size,
    }, { onConflict: "snapshot_month" });

  return new Response(
    JSON.stringify({ ok: !error, snapshot_month: snapshotMonth, total_mrr: Math.round(totalMrr), active_count: activeOrgIds.size }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
