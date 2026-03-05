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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the caller is an admin (super admin)
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .single();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden: Super Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { email, password, full_name, phone, business_name, role = "client", manager_id, mapping_keyword, pricing_config, data_fetch_start_date } = await req.json();

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create auth user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Update profile with extra fields
    const profileUpdate: any = { phone, business_name, full_name };
    if (role === "client" && manager_id && manager_id !== "none") {
      profileUpdate.manager_id = manager_id;
    }
    if (mapping_keyword) {
      profileUpdate.mapping_keyword = mapping_keyword;
    }
    if (pricing_config) {
      // Normalize to standard { platform_rates: { meta, tiktok, google }, percentage } format
      const normalized: any = {};

      // Handle legacy formats
      if (pricing_config.platform_rates) {
        normalized.platform_rates = pricing_config.platform_rates;
      } else if (pricing_config.flat_rates) {
        normalized.platform_rates = pricing_config.flat_rates;
      } else if (pricing_config.rates) {
        normalized.platform_rates = pricing_config.rates;
      } else {
        normalized.platform_rates = { meta: 145, tiktok: 150, google: 155 };
      }

      normalized.percentage = pricing_config.percentage ?? pricing_config.markup ?? 0;

      profileUpdate.pricing_config = normalized;
    }

    await supabaseAdmin
      .from("profiles")
      .update(profileUpdate)
      .eq("user_id", newUser.user.id);

    // Assign role (client or manager)
    const assignRole = role === "manager" ? "manager" : "client";
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUser.user.id, role: assignRole });

    // If manager, create default permissions row
    if (assignRole === "manager") {
      await supabaseAdmin
        .from("manager_permissions")
        .insert({ user_id: newUser.user.id });
    }

    return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
