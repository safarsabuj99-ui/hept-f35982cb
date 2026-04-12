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

  // Find trial orgs whose trial has expired (trial_ends_at + grace_period_days < now)
  const { data: trialOrgs, error } = await supabase
    .from("organizations")
    .select("id, name, trial_ends_at, grace_period_days, status, owner_user_id")
    .eq("status", "trial")
    .not("trial_ends_at", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  let suspended = 0;

  for (const org of trialOrgs ?? []) {
    const trialEnd = new Date(org.trial_ends_at).getTime();
    const graceMs = (org.grace_period_days ?? 7) * 86400000;

    if (now > trialEnd + graceMs) {
      await supabase
        .from("organizations")
        .update({
          status: "suspended",
          suspension_reason: "Trial expired (auto-suspended)",
          status_changed_at: new Date().toISOString(),
        })
        .eq("id", org.id);

      // Notify agency owner about trial expiry
      if (org.owner_user_id) {
        await supabase.from("notifications").insert({
          user_id: org.owner_user_id,
          title: "⏰ Trial Expired",
          body: `Your trial for ${org.name} has ended. Please upgrade to a plan to continue using the platform.`,
          type: "system",
          priority: "high",
          link: "/admin/subscription",
        });
      }

      suspended++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, checked: (trialOrgs ?? []).length, suspended }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
