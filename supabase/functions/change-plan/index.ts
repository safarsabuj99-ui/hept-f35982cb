import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireCaller,
  requireOrgAccess,
  requireRole,
} from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await requireCaller(req);
    requireRole(ctx, ["admin", "platform_owner"]);

    const { org_id, new_plan_key, new_billing_cycle } = await req.json();
    if (!org_id) return jsonResponse({ error: "Missing org_id" }, 400);

    await requireOrgAccess(ctx, org_id);
    const supabase = ctx.supabaseAdmin;

    // Get current org and subscription
    const { data: org } = await supabase
      .from("organizations")
      .select("*, organization_subscriptions(*)")
      .eq("id", org_id)
      .single();
    if (!org) throw new Error("Organization not found");

    const currentSub = (org as any).organization_subscriptions?.[0];
    if (!currentSub) throw new Error("No active subscription");

    // Get target plan
    const { data: newPlan } = await supabase
      .from("platform_plans")
      .select("*")
      .eq("key", new_plan_key)
      .eq("is_active", true)
      .single();
    if (!newPlan) throw new Error("Target plan not found or inactive");

    const cycle = new_billing_cycle || currentSub.billing_cycle;
    const newAmount = cycle === "yearly" ? newPlan.price_bdt_yearly : newPlan.price_bdt_monthly;

    // Calculate proration
    const now = new Date();
    const periodEnd = new Date(currentSub.current_period_end);
    const periodStart = new Date(currentSub.current_period_start);
    const totalDays = Math.max(1, (periodEnd.getTime() - periodStart.getTime()) / 86400000);
    const remainingDays = Math.max(0, (periodEnd.getTime() - now.getTime()) / 86400000);
    const dailyRate = currentSub.amount_bdt / totalDays;
    const credit = Math.round(dailyRate * remainingDays);
    const newDailyRate = newAmount / (cycle === "yearly" ? 365 : 30);
    const charge = Math.round(newDailyRate * remainingDays);

    // Validate resource limits for downgrades
    const { count: clientCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact" })
      .eq("org_id", org_id);
    const { count: accountCount } = await supabase
      .from("ad_accounts")
      .select("id", { count: "exact" })
      .eq("org_id", org_id)
      .eq("is_active", true);

    if ((clientCount || 0) > newPlan.max_clients) {
      return jsonResponse({
        error: `Cannot change to ${newPlan.name}: you have ${clientCount} clients but the plan allows ${newPlan.max_clients}`,
      }, 400);
    }
    if ((accountCount || 0) > newPlan.max_ad_accounts) {
      return jsonResponse({
        error: `Cannot change to ${newPlan.name}: you have ${accountCount} ad accounts but the plan allows ${newPlan.max_ad_accounts}`,
      }, 400);
    }

    // Apply plan change
    await supabase.from("organizations").update({
      plan: new_plan_key,
      max_clients: newPlan.max_clients,
      max_ad_accounts: newPlan.max_ad_accounts,
      max_managers: newPlan.max_managers,
      allowed_features: newPlan.feature_flags,
    }).eq("id", org_id);

    await supabase.from("organization_subscriptions").update({
      plan: new_plan_key,
      billing_cycle: cycle,
      amount_bdt: newAmount,
      updated_at: now.toISOString(),
    }).eq("id", currentSub.id);

    await supabase.from("plan_change_log").insert({
      org_id,
      from_plan: org.plan,
      to_plan: new_plan_key,
      from_cycle: currentSub.billing_cycle,
      to_cycle: cycle,
      proration_credit_bdt: credit,
      proration_charge_bdt: charge,
      status: "completed",
    });

    await supabase.from("notifications").insert({
      user_id: org.owner_user_id,
      title: "Plan Changed Successfully",
      body: `Your plan has been changed to ${newPlan.name}. Credit: ৳${credit}, Charge: ৳${charge}.`,
      type: "system",
      priority: "normal",
      link: "/admin/subscription",
    });

    return jsonResponse({
      ok: true,
      from: org.plan,
      to: new_plan_key,
      credit,
      charge,
      net: charge - credit,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
