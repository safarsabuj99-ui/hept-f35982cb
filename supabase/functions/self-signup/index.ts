import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { full_name, email, password, agency_name, plan_key, billing_cycle, payment_method, transaction_reference, proof_image_url, ref_code } = body;

    // Validate required fields
    if (!full_name?.trim() || !email?.trim() || !password || !agency_name?.trim() || !plan_key || !billing_cycle || !payment_method || !transaction_reference?.trim()) {
      return new Response(JSON.stringify({ error: "All fields are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if email already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.some((u: any) => u.email?.toLowerCase() === email.toLowerCase().trim());
    if (emailExists) {
      return new Response(JSON.stringify({ error: "An account with this email already exists" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the selected plan
    const { data: plan, error: planError } = await supabaseAdmin
      .from("platform_plans")
      .select("*")
      .eq("key", plan_key)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: "Invalid plan selected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Create auth user (auto-confirm email)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim() },
    });

    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: authError?.message || "Failed to create user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authData.user.id;
    const slug = agency_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36);
    const amount = billing_cycle === "yearly" ? plan.price_bdt_yearly : plan.price_bdt_monthly;

    // Resolve affiliate from ref_code
    let affiliateId: string | null = null;
    if (ref_code) {
      const { data: linkData } = await supabaseAdmin.from("affiliate_links")
        .select("id, affiliate_id, clicks").eq("code", ref_code).eq("is_active", true).single();
      if (linkData) {
        affiliateId = linkData.affiliate_id;
        // Increment click count
        await supabaseAdmin.from("affiliate_links").update({ clicks: (linkData.clicks || 0) + 1 }).eq("id", linkData.id);
      }
    }

    // 2. Create organization
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: agency_name.trim(),
        slug,
        owner_user_id: userId,
        plan: plan.key,
        status: "pending_payment",
        max_clients: plan.max_clients,
        max_ad_accounts: plan.max_ad_accounts,
        max_managers: plan.max_managers,
        allowed_features: plan.feature_flags || {},
        brand_name: agency_name.trim(),
        ...(affiliateId ? { referred_by_affiliate_id: affiliateId } : {}),
      })
      .select("id")
      .single();

    if (orgError || !org) {
      // Cleanup: delete the auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: "Failed to create organization" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2b. Create affiliate conversion if referred
    if (affiliateId && ref_code) {
      const { data: linkData2 } = await supabaseAdmin.from("affiliate_links")
        .select("id").eq("code", ref_code).single();
      await supabaseAdmin.from("affiliate_conversions").insert({
        affiliate_id: affiliateId,
        link_id: linkData2?.id || null,
        referred_org_id: org.id,
        referred_org_name: agency_name.trim(),
        status: "pending",
      });
    }

    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "admin" });

    // 4. Update profile with org_id
    await supabaseAdmin.from("profiles").update({
      org_id: org.id,
      full_name: full_name.trim(),
      is_super_admin: true,
    }).eq("user_id", userId);

    // 5. Create subscription
    const periodStart = new Date().toISOString().slice(0, 10);
    const periodEnd = new Date(
      billing_cycle === "yearly"
        ? Date.now() + 365 * 86400000
        : Date.now() + 30 * 86400000
    ).toISOString().slice(0, 10);

    await supabaseAdmin.from("organization_subscriptions").insert({
      org_id: org.id,
      plan: plan.key,
      billing_cycle,
      amount_bdt: amount,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      payment_status: "pending",
    });

    // 6. Create invoice
    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
    const { data: invoice } = await supabaseAdmin
      .from("platform_invoices")
      .insert({
        org_id: org.id,
        invoice_number: invoiceNumber,
        amount_bdt: amount,
        period_start: periodStart,
        period_end: periodEnd,
        status: "sent",
        due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    // 7. Create subscription payment record
    await supabaseAdmin.from("subscription_payments").insert({
      org_id: org.id,
      invoice_id: invoice?.id || null,
      amount_bdt: amount,
      payment_method,
      transaction_reference: transaction_reference.trim(),
      proof_image_url: proof_image_url || null,
      status: "pending",
    });

    // 8. Notify platform owners
    const { data: platformOwners } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "platform_owner");

    if (platformOwners?.length) {
      const notifications = platformOwners.map((po: any) => ({
        user_id: po.user_id,
        title: "New Agency Signup",
        body: `${agency_name.trim()} (${full_name.trim()}) signed up for ${plan.name} plan. Payment verification pending.`,
        type: "system",
        priority: "high",
        link: "/platform/billing",
      }));
      await supabaseAdmin.from("notifications").insert(notifications);
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
