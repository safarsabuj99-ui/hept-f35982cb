import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCaller, requireRole, requireOrgAccess, AuthError, corsHeaders } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // Require authenticated caller (admin/platform_owner) or service-role cron.
    const ctx = await requireCaller(req);
    if (!ctx.isServiceCall) {
      requireRole(ctx, ["admin", "platform_owner"]);
    }

    const { template_key, org_id, user_id, to_email, variables } = await req.json();

    if (!template_key || !to_email) {
      return new Response(JSON.stringify({ error: "Missing template_key or to_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Enforce tenant boundary on non-service callers.
    if (!ctx.isServiceCall && org_id) {
      await requireOrgAccess(ctx, org_id);
    }

    const { data: template } = await supabase.from("email_templates").select("*")
      .eq("key", template_key).eq("is_active", true).single();

    if (!template) {
      return new Response(JSON.stringify({ error: `Template '${template_key}' not found or inactive` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let subject = template.subject_en;
    let bodyHtml = template.body_html;
    let bodyText = template.body_text;

    if (variables && typeof variables === "object") {
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        subject = subject.replaceAll(placeholder, String(value));
        bodyHtml = bodyHtml.replaceAll(placeholder, String(value));
        bodyText = bodyText.replaceAll(placeholder, String(value));
      }
    }

    const { data: logEntry } = await supabase.from("email_log").insert({
      org_id: org_id || null, user_id: user_id || null, template_key,
      to_email, subject, status: "queued",
    }).select("id").single();

    if (logEntry) {
      await supabase.from("email_log").update({
        status: "sent", sent_at: new Date().toISOString(),
      }).eq("id", logEntry.id);
    }

    return new Response(JSON.stringify({ ok: true, email_log_id: logEntry?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return new Response(JSON.stringify({ error: err.message }),
        { status: err.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
