import {
  errorResponse,
  jsonResponse,
  requireCaller,
  requireOrgAccess,
  requireRole,
} from "../_shared/auth.ts";

const PASSWORD_MIN_LENGTH = 8;

function getPasswordValidationError(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Password must include uppercase, lowercase, and a number.";
  }

  return null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ctx = await requireCaller(req);
    requireRole(ctx, ["admin", "platform_owner"]);
    const supabaseAdmin = ctx.supabaseAdmin;

    const { user_id, new_password } = await req.json();
    if (!user_id || !new_password) {
      return jsonResponse({ error: "user_id and new_password are required" }, 400);
    }

    // Cross-tenant guard: target user must belong to caller's org
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("org_id")
      .eq("user_id", user_id)
      .maybeSingle();
    if (!targetProfile) return jsonResponse({ error: "Target user not found" }, 404);
    await requireOrgAccess(ctx, targetProfile.org_id as string | null);

    const passwordValidationError = getPasswordValidationError(new_password);
    if (passwordValidationError) {
      return jsonResponse(
        { error: passwordValidationError, code: "password_policy_violation" },
        400,
      );
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: new_password,
    });

    if (error) {
      console.error("updateUserById failed:", error);
      const code = (error as any).code ?? (error as any).name ?? null;
      const status = (error as any).status && (error as any).status >= 400 && (error as any).status < 500
        ? (error as any).status
        : 400;
      return jsonResponse({ error: error.message, code }, status);
    }

    await supabaseAdmin.from("audit_logs").insert({
      user_id: ctx.userId,
      action_type: "client_password_reset",
      description: `Admin reset password for user ${user_id}`,
    });

    return jsonResponse({ success: true, message: "Password updated successfully" });
  } catch (err) {
    return errorResponse(err);
  }
});
