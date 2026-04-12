import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let processed = 0, recovered = 0, newRuns = 0;

  try {
    const now = new Date();

    // 1. Auto-create dunning runs for new overdue subscriptions without active dunning
    const { data: overdueSubs } = await supabase.from("organization_subscriptions")
      .select("id, org_id, amount_bdt").eq("payment_status", "overdue");

    const { data: defaultSchedule } = await supabase.from("dunning_schedules")
      .select("id").eq("is_default", true).limit(1).single();

    for (const sub of overdueSubs ?? []) {
      const { data: existingRun } = await supabase.from("dunning_runs")
        .select("id").eq("subscription_id", sub.id).eq("status", "active").limit(1);

      if (!existingRun?.length && defaultSchedule) {
        await supabase.from("dunning_runs").insert({
          org_id: sub.org_id, subscription_id: sub.id,
          schedule_id: defaultSchedule.id, status: "active",
        });
        newRuns++;
      }
    }

    // 2. Process active dunning runs
    const { data: activeRuns } = await supabase.from("dunning_runs")
      .select("*, dunning_schedules(steps), organizations(name, owner_user_id, status, allowed_features)")
      .eq("status", "active");

    for (const run of activeRuns ?? []) {
      const schedule = (run as any).dunning_schedules;
      const org = (run as any).organizations;
      if (!schedule?.steps || !org) continue;

      const steps = schedule.steps as any[];
      const daysSinceStart = Math.floor((now.getTime() - new Date(run.started_at).getTime()) / 86400000);

      // Check if payment was made (subscription no longer overdue)
      const { data: sub } = await supabase.from("organization_subscriptions")
        .select("payment_status").eq("id", run.subscription_id).single();

      if (sub?.payment_status === "paid") {
        await supabase.from("dunning_runs").update({
          status: "recovered", recovery_amount_bdt: run.recovery_amount_bdt || 0,
        }).eq("id", run.id);
        recovered++;
        continue;
      }

      // Find next step to execute
      let nextStep = null;
      for (let i = run.current_step; i < steps.length; i++) {
        if (daysSinceStart >= steps[i].day) {
          const lastActionDay = run.last_action_at
            ? Math.floor((now.getTime() - new Date(run.last_action_at).getTime()) / 86400000)
            : daysSinceStart;
          if (i > run.current_step || !run.last_action_at) {
            nextStep = { index: i, ...steps[i] };
          }
        }
      }

      if (!nextStep) continue;

      // Execute step
      if (nextStep.action === "email" && nextStep.template) {
        // Call send-email function
        await supabase.functions.invoke("send-email", {
          body: {
            template_key: nextStep.template,
            org_id: run.org_id,
            user_id: org.owner_user_id,
            to_email: "", // Would need to look up email
            variables: { org_name: org.name, amount: String(run.recovery_amount_bdt || 0), days_overdue: String(daysSinceStart) },
          },
        });
      } else if (nextStep.action === "restrict") {
        // Restrict features
        const features = org.allowed_features || {};
        await supabase.from("organizations").update({
          allowed_features: { ...features, api_access: false, ad_guard: false },
        }).eq("id", run.org_id);

        await supabase.from("notifications").insert({
          user_id: org.owner_user_id, title: "Features Restricted ⚠️",
          body: `Some features for ${org.name} have been restricted due to overdue payment.`,
          type: "system", priority: "urgent", link: "/admin/subscription",
        });
      } else if (nextStep.action === "suspend") {
        await supabase.from("organizations").update({
          status: "suspended", suspension_reason: "Overdue payment (dunning auto-suspend)",
          status_changed_at: now.toISOString(),
        }).eq("id", run.org_id);

        await supabase.from("notifications").insert({
          user_id: org.owner_user_id, title: "Agency Suspended ⚠️",
          body: `${org.name} has been suspended due to continued non-payment.`,
          type: "system", priority: "urgent", link: "/admin/subscription",
        });
      }

      await supabase.from("dunning_runs").update({
        current_step: nextStep.index, last_action_at: now.toISOString(),
        ...(nextStep.index >= steps.length - 1 ? { status: "exhausted" } : {}),
      }).eq("id", run.id);

      processed++;
    }

    return new Response(JSON.stringify({ ok: true, processed, recovered, newRuns }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
