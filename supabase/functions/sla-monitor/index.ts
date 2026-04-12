import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let breached = 0, checked = 0;

  try {
    const now = new Date();

    // Check open tickets against SLA
    const { data: openTickets } = await supabase.from("support_tickets")
      .select("*, support_tiers(response_time_hours, resolution_time_hours)")
      .in("status", ["open", "in_progress", "waiting"])
      .eq("sla_breached", false);

    for (const ticket of openTickets ?? []) {
      const tier = (ticket as any).support_tiers;
      if (!tier) continue;
      checked++;

      const createdAt = new Date(ticket.created_at).getTime();
      const hoursSinceCreated = (now.getTime() - createdAt) / 3600000;

      // Check response time SLA
      if (!ticket.first_response_at && hoursSinceCreated > tier.response_time_hours) {
        await supabase.from("support_tickets").update({ sla_breached: true }).eq("id", ticket.id);

        // Notify platform owner (get any platform_owner user)
        const { data: owners } = await supabase.from("user_roles")
          .select("user_id").eq("role", "platform_owner").limit(1);

        if (owners?.[0]) {
          await supabase.from("notifications").insert({
            user_id: owners[0].user_id, title: "SLA Breach ⚠️",
            body: `Ticket "${ticket.subject}" has breached response time SLA (${tier.response_time_hours}h).`,
            type: "system", priority: "urgent", link: "/platform/support",
          });
        }
        breached++;
      }

      // Check resolution time SLA
      if (hoursSinceCreated > tier.resolution_time_hours && ticket.status !== "resolved") {
        await supabase.from("support_tickets").update({ sla_breached: true }).eq("id", ticket.id);
        breached++;
      }
    }

    // Monthly SLA metrics aggregation (run on 1st of month)
    if (now.getDate() === 1) {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

      const { data: orgs } = await supabase.from("organizations").select("id");
      for (const org of orgs ?? []) {
        const { data: tickets } = await supabase.from("support_tickets")
          .select("*").eq("org_id", org.id)
          .gte("created_at", lastMonth + "T00:00:00Z")
          .lte("created_at", lastMonthEnd + "T23:59:59Z");

        if (!tickets?.length) continue;

        const resolved = tickets.filter(t => t.status === "resolved" || t.status === "closed");
        const breachCount = tickets.filter(t => t.sla_breached).length;
        const avgResponse = resolved.filter(t => t.first_response_at).reduce((sum, t) => {
          return sum + (new Date(t.first_response_at!).getTime() - new Date(t.created_at).getTime()) / 3600000;
        }, 0) / Math.max(1, resolved.filter(t => t.first_response_at).length);
        const avgResolution = resolved.filter(t => t.resolved_at).reduce((sum, t) => {
          return sum + (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()) / 3600000;
        }, 0) / Math.max(1, resolved.filter(t => t.resolved_at).length);

        await supabase.from("sla_metrics").upsert({
          org_id: org.id, month: lastMonth,
          tickets_total: tickets.length, tickets_resolved: resolved.length,
          avg_response_hours: Math.round(avgResponse * 10) / 10,
          avg_resolution_hours: Math.round(avgResolution * 10) / 10,
          sla_breach_count: breachCount,
        }, { onConflict: "org_id,month" });
      }
    }

    return new Response(JSON.stringify({ ok: true, checked, breached }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
