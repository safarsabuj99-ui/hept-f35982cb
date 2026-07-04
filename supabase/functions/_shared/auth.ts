// Shared auth + cross-tenant guard helpers for edge functions.
// Use these in every user-callable function that runs with SERVICE_ROLE_KEY.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Reusable strict email validator — requires a TLD of 2+ chars.
// Catches typos like "foo@gmail" (missing .com) that browser type=email accepts.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isValidEmail(raw: unknown): raw is string {
  return typeof raw === "string" && EMAIL_REGEX.test(raw.trim());
}
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export class AuthError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return jsonResponse({ error: err.message, code: err.code }, err.status);
  }
  const msg = err instanceof Error ? err.message : String(err);
  return jsonResponse({ error: msg }, 500);
}

export type Role = "admin" | "manager" | "client" | "platform_owner" | "affiliate";

export interface CallerContext {
  userId: string;
  orgId: string | null;
  roles: Role[];
  isServiceCall: boolean;
  supabaseAdmin: SupabaseClient;
}

/** Build a service-role client (bypasses RLS). */
export function getAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Verify the caller and return their context.
 * - 401 if no/invalid Authorization header.
 * - Accepts SERVICE_ROLE_KEY as bearer for internal/cron callers (isServiceCall=true).
 * - Otherwise resolves the JWT, loads org_id + roles in one round-trip.
 */
export async function requireCaller(req: Request): Promise<CallerContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError(401, "Unauthorized");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const supabaseAdmin = getAdminClient();

  // Service-role bypass for DB triggers / cron
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (token && token === svcKey) {
    return {
      userId: "00000000-0000-0000-0000-000000000000",
      orgId: null,
      roles: [],
      isServiceCall: true,
      supabaseAdmin,
    };
  }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) {
    throw new AuthError(401, "Unauthorized");
  }
  const userId = userData.user.id;

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabaseAdmin.from("profiles").select("org_id").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
  ]);

  return {
    userId,
    orgId: (profile?.org_id as string | null) ?? null,
    roles: ((roleRows ?? []) as { role: Role }[]).map((r) => r.role),
    isServiceCall: false,
    supabaseAdmin,
  };
}

export function requireRole(ctx: CallerContext, allowed: Role[]) {
  if (ctx.isServiceCall) return;
  const ok = ctx.roles.some((r) => allowed.includes(r));
  if (!ok) throw new AuthError(403, `Forbidden: requires ${allowed.join(" or ")}`);
}

/**
 * Assert the caller may act on `targetOrgId`. Platform owners bypass.
 * Logs a tripwire row to audit_logs on every blocked attempt.
 */
export async function requireOrgAccess(ctx: CallerContext, targetOrgId: string | null | undefined) {
  if (ctx.isServiceCall) return;
  if (!targetOrgId) throw new AuthError(400, "Missing target org_id");
  if (ctx.roles.includes("platform_owner")) return;
  if (ctx.orgId && ctx.orgId === targetOrgId) return;

  // Tripwire — fire-and-forget
  try {
    await ctx.supabaseAdmin.from("audit_logs").insert({
      user_id: ctx.userId,
      action_type: "cross_tenant_blocked",
      description: `Caller org=${ctx.orgId ?? "none"} attempted to access org=${targetOrgId}`,
    });
  } catch (_) { /* swallow */ }

  throw new AuthError(403, "Forbidden: cross-tenant access denied");
}

/**
 * Resolve org_id from a row (table.idColumn = idValue) and assert access.
 * Throws 404 if the row doesn't exist.
 * Returns the resolved org_id for downstream use.
 */
export async function requireRowOrgAccess(
  ctx: CallerContext,
  table: string,
  idColumn: string,
  idValue: string,
  orgColumn = "org_id",
): Promise<string> {
  if (!idValue) throw new AuthError(400, `Missing ${idColumn}`);
  const { data, error } = await ctx.supabaseAdmin
    .from(table)
    .select(orgColumn)
    .eq(idColumn, idValue)
    .maybeSingle();
  if (error || !data) throw new AuthError(404, `${table} not found`);
  const orgId = (data as Record<string, string | null>)[orgColumn] ?? null;
  await requireOrgAccess(ctx, orgId);
  return orgId as string;
}
