import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { full_name, email, password, phone, payment_method } = await req.json();

    if (!full_name?.trim() || !email?.trim() || !password) {
      return new Response(JSON.stringify({ error: "Name, email, and password are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Check existing email
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    if (existingUsers?.users?.some((u: any) => u.email?.toLowerCase() === email.toLowerCase().trim())) {
      return new Response(JSON.stringify({ error: "An account with this email already exists" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim() },
    });

    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: authError?.message || "Failed to create user" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authData.user.id;

    // Assign affiliate role
    const { error: roleErr } = await supabase.from("user_roles").insert({ user_id: userId, role: "affiliate" });
    if (roleErr) {
      await supabase.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: "Failed to assign role" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create affiliate profile
    const { error: affErr } = await supabase.from("affiliates").insert({
      user_id: userId,
      full_name: full_name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      payment_method: payment_method || "bkash",
      payment_details: phone?.trim() ? { account_number: phone.trim() } : {},
      status: "active",
    });

    if (affErr) {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      await supabase.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: "Failed to create affiliate profile" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Notify platform owners
    const { data: owners } = await supabase.from("user_roles").select("user_id").eq("role", "platform_owner");
    if (owners?.length) {
      await supabase.from("notifications").insert(
        owners.map((o: any) => ({
          user_id: o.user_id,
          title: "New Affiliate Registered",
          body: `${full_name.trim()} (${email.trim()}) registered as an affiliate.`,
          type: "system",
          priority: "normal",
          link: "/platform/affiliates",
        }))
      );
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
