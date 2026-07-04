import {
  corsHeaders,
  errorResponse,
  isValidEmail,
  jsonResponse,
  normalizeEmail,
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

    const { user_id, new_email } = await req.json();
    if (!user_id || !new_email) {
      return jsonResponse({ error: "user_id and new_email are required" }, 400);
    }
    if (!isValidEmail(new_email)) {
      return jsonResponse(
        { error: "Invalid email format. Please enter a complete address like name@example.com.", code: "invalid_email" },
        400,
      );
    }
    const email = normalizeEmail(new_email);

    // Cross-tenant guard: target user must belong to caller's org
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("org_id")
      .eq("user_id", user_id)
      .maybeSingle();
    if (!targetProfile) return jsonResponse({ error: "Target user not found" }, 404);
    await requireOrgAccess(ctx, targetProfile.org_id as string | null);

    // Fetch old email for audit log
    const { data: oldUser } = await supabaseAdmin.auth.admin.getUserById(user_id);
    const oldEmail = oldUser?.user?.email ?? null;

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      email,
      email_confirm: true,
    });

    if (error) {
      const code = (error as any).code ?? (error as any).name ?? null;
      const status =
        (error as any).status && (error as any).status >= 400 && (error as any).status < 500
          ? (error as any).status
          : 400;
      return jsonResponse({ error: error.message, code }, status);
    }

    await supabaseAdmin.from("audit_logs").insert({
      user_id: ctx.userId,
      action_type: "client_email_corrected",
      description: `Admin corrected email for user ${user_id}: ${oldEmail ?? "unknown"} -> ${email}`,
    });

    return jsonResponse({ success: true, email, previous_email: oldEmail });
  } catch (err) {
    return errorResponse(err);
  }
});
