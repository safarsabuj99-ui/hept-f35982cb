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
    const { email, password } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // SECURITY: This is a one-time bootstrap endpoint. Once a platform_owner
    // exists, the only way to invoke this is by presenting the service role
    // key as a Bearer token (server-side / migration use).
    const { data: existingOwners } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "platform_owner")
      .limit(1);

    if (existingOwners && existingOwners.length > 0) {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      let allowed = false;
      if (token && token === svcKey) {
        allowed = true;
      } else if (token) {
        const { data: userData } = await supabaseAdmin.auth.getUser(token);
        if (userData?.user) {
          const { data: roleRow } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", userData.user.id)
            .eq("role", "platform_owner")
            .maybeSingle();
          allowed = !!roleRow;
        }
      }
      if (!allowed) {
        return new Response(
          JSON.stringify({ error: "Bootstrap already completed. Only an existing platform owner can call this." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      // Update password
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError) throw createError;
      userId = newUser.user.id;
    }

    // Ensure profile exists
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile) {
      await supabaseAdmin.from("profiles").insert({
        user_id: userId,
        full_name: "Platform Owner",
        email,
        is_super_admin: true,
      });
    }

    // Assign platform_owner role (upsert)
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "platform_owner")
      .maybeSingle();

    if (!existingRole) {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: "platform_owner" });

      if (roleError) throw roleError;
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId, message: "Platform owner account ready" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
