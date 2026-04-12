import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { template_key, org_id, user_id, to_email, variables } = await req.json();

    if (!template_key || !to_email) {
      return new Response(JSON.stringify({ error: "Missing template_key or to_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get template
    const { data: template } = await supabase.from("email_templates").select("*")
      .eq("key", template_key).eq("is_active", true).single();

    if (!template) {
      return new Response(JSON.stringify({ error: `Template '${template_key}' not found or inactive` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Substitute variables
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

    // Log the email
    const { data: logEntry } = await supabase.from("email_log").insert({
      org_id: org_id || null, user_id: user_id || null, template_key,
      to_email, subject, status: "queued",
    }).select("id").single();

    // For now, mark as sent (actual email delivery would use Resend/SES/etc.)
    // This is a placeholder - integrate with actual email provider when ready
    if (logEntry) {
      await supabase.from("email_log").update({
        status: "sent", sent_at: new Date().toISOString(),
      }).eq("id", logEntry.id);
    }

    return new Response(JSON.stringify({ ok: true, email_log_id: logEntry?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
