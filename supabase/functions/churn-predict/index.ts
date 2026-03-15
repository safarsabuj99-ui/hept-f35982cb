import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { org_ids } = await req.json();

    // Gather data for all orgs
    const { data: orgs } = await supabase.from("organizations").select("id, name, status, plan, created_at, status_changed_at").in("id", org_ids);
    const { data: invoices } = await supabase.from("platform_invoices").select("org_id, status, due_date");
    const { data: auditLogs } = await supabase.from("audit_logs").select("org_id, created_at").order("created_at", { ascending: false }).limit(500);
    const { data: profiles } = await supabase.from("profiles").select("org_id");
    const { data: adAccounts } = await supabase.from("ad_accounts").select("org_id");

    // Build per-org metrics
    const orgMetrics = (orgs || []).map((org: any) => {
      const orgInvoices = (invoices || []).filter((i: any) => i.org_id === org.id);
      const overdueCount = orgInvoices.filter((i: any) => i.status === "overdue").length;
      const lastLog = (auditLogs || []).find((l: any) => l.org_id === org.id);
      const daysSinceLogin = lastLog ? Math.floor((Date.now() - new Date(lastLog.created_at).getTime()) / 86400000) : 999;
      const clientCount = (profiles || []).filter((p: any) => p.org_id === org.id).length;
      const accountCount = (adAccounts || []).filter((a: any) => a.org_id === org.id).length;

      return {
        name: org.name,
        id: org.id,
        status: org.status,
        plan: org.plan,
        days_since_signup: Math.floor((Date.now() - new Date(org.created_at).getTime()) / 86400000),
        days_since_login: daysSinceLogin,
        overdue_invoices: overdueCount,
        total_invoices: orgInvoices.length,
        clients: clientCount,
        ad_accounts: accountCount,
      };
    });

    const prompt = `You are an analytics engine. Given the following agency metrics, predict churn risk for each.
Return a JSON array of objects with: org_id, risk_score (0-100), risk_level ("high"|"medium"|"low"), factors (array of short strings).

Metrics:
${JSON.stringify(orgMetrics, null, 2)}

Rules:
- high: score >= 70
- medium: score 40-69
- low: score < 40
- Consider: inactivity (days_since_login), payment issues (overdue_invoices), low usage (few clients/accounts), trial status
Return ONLY the JSON array, no markdown.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const text = await aiResponse.text();
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error ${status}: ${text}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    
    let predictions;
    try {
      predictions = JSON.parse(content.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    } catch {
      predictions = [];
    }

    // Enrich with org names
    predictions = predictions.map((p: any) => {
      const org = orgMetrics.find((o: any) => o.id === p.org_id);
      return { ...p, org_name: org?.name || "Unknown" };
    });

    return new Response(JSON.stringify({ predictions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("churn-predict error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
