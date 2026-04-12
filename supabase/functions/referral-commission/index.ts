import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let qualified = 0, processed = 0;

  try {
    const now = new Date();

    // Get active referral programs
    const { data: programs } = await supabase.from("referral_program").select("*").eq("is_active", true);
    if (!programs?.length) {
      return new Response(JSON.stringify({ ok: true, message: "No active referral programs" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get pending referral tracking entries
    const { data: pendingRefs } = await supabase.from("referral_tracking")
      .select("*, referral_codes(program_id, org_id)").eq("status", "pending");

    for (const ref of pendingRefs ?? []) {
      const codeData = (ref as any).referral_codes;
      if (!codeData) continue;

      const program = programs.find(p => p.id === codeData.program_id);
      if (!program) continue;

      // Check if referred org has been active for min_months
      const { data: referredOrg } = await supabase.from("organizations")
        .select("status, created_at").eq("id", ref.referred_org_id).single();

      if (!referredOrg || referredOrg.status !== "active") continue;

      const monthsActive = (now.getTime() - new Date(referredOrg.created_at).getTime()) / (30 * 86400000);
      if (monthsActive < program.min_months) continue;

      // Check if referred org has paid subscription
      const { data: sub } = await supabase.from("organization_subscriptions")
        .select("payment_status, amount_bdt").eq("org_id", ref.referred_org_id)
        .eq("payment_status", "paid").limit(1).single();

      if (!sub) continue;

      // Calculate commission
      let commission = 0;
      if (program.commission_type === "percentage") {
        commission = Math.round(sub.amount_bdt * program.commission_value / 100);
      } else {
        commission = program.commission_value;
      }

      // Check max payouts cap
      if (program.max_payouts) {
        const { count } = await supabase.from("referral_tracking")
          .select("id", { count: "exact" })
          .eq("referrer_org_id", codeData.org_id)
          .in("status", ["qualified", "paid"]);

        if ((count || 0) >= program.max_payouts) continue;
      }

      // Mark as qualified
      await supabase.from("referral_tracking").update({
        status: "qualified", qualified_at: now.toISOString(), commission_bdt: commission,
      }).eq("id", ref.id);

      // Notify referrer
      const { data: referrerOrg } = await supabase.from("organizations")
        .select("owner_user_id, name").eq("id", codeData.org_id).single();

      if (referrerOrg) {
        await supabase.from("notifications").insert({
          user_id: referrerOrg.owner_user_id,
          title: "Referral Commission Earned! 🎉",
          body: `You earned ৳${commission} from a referral. Pending platform owner approval.`,
          type: "system", priority: "normal", link: "/admin/subscription",
        });
      }

      qualified++;
      processed++;
    }

    return new Response(JSON.stringify({ ok: true, processed, qualified }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
