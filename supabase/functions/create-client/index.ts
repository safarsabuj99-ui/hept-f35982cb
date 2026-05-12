import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireCaller,
  requireOrgAccess,
  requireRole,
} from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ctx = await requireCaller(req);
    requireRole(ctx, ["admin", "platform_owner"]);

    const supabaseAdmin = ctx.supabaseAdmin;
    const {
      email, password, full_name, phone, business_name,
      role = "client", manager_id, mapping_keyword, pricing_config,
      data_fetch_start_date, org_id,
    } = await req.json();

    if (!email || !password || !full_name) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    // Resolve target org: use body org_id or caller's own org. Then enforce access.
    const targetOrgId: string | null = org_id ?? ctx.orgId;
    if (!targetOrgId) return jsonResponse({ error: "Missing org_id" }, 400);
    await requireOrgAccess(ctx, targetOrgId);

    // Create auth user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) return jsonResponse({ error: createError.message }, 400);

    const profileUpdate: any = { phone, business_name, full_name, org_id: targetOrgId };
    if (role === "client" && manager_id && manager_id !== "none") {
      profileUpdate.manager_id = manager_id;
    }
    if (mapping_keyword) profileUpdate.mapping_keyword = mapping_keyword;
    if (data_fetch_start_date) profileUpdate.data_fetch_start_date = data_fetch_start_date;

    if (pricing_config) {
      const normalized: any = {};
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

    await supabaseAdmin.from("profiles").update(profileUpdate).eq("user_id", newUser.user.id);

    const assignRole = role === "manager" ? "manager" : "client";
    await supabaseAdmin.from("user_roles").insert({ user_id: newUser.user.id, role: assignRole });

    if (assignRole === "manager") {
      await supabaseAdmin.from("manager_permissions").insert({ user_id: newUser.user.id });
    }

    return jsonResponse({ success: true, user_id: newUser.user.id });
  } catch (err) {
    return errorResponse(err);
  }
});
