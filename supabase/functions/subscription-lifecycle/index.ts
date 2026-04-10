import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const in10Days = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

  let reminders = 0;
  let invoicesGenerated = 0;
  let overdueMarked = 0;
  let suspended = 0;
  let invoicesOverdue = 0;

  try {
    // 1. Fetch subscriptions expiring within 10 days
    const { data: subs } = await supabase
      .from("organization_subscriptions")
      .select("*, organizations(id, name, status, grace_period_days, owner_user_id)")
      .lte("current_period_end", in10Days);

    for (const sub of subs ?? []) {
      const org = (sub as any).organizations;
      if (!org || org.status === "cancelled") continue;

      const periodEnd = sub.current_period_end;
      const ownerId = org.owner_user_id;

      // Send 7-day renewal reminder
      if (periodEnd === in7Days || periodEnd === in3Days) {
        const daysLeft = periodEnd === in7Days ? 7 : 3;
        // Check if reminder already sent today
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", ownerId)
          .eq("group_key", `renewal_${sub.org_id}_${periodEnd}`)
          .gte("created_at", today + "T00:00:00Z")
          .limit(1);

        if (!existing?.length) {
          await supabase.from("notifications").insert({
            user_id: ownerId,
            title: "Subscription Renewal Reminder",
            body: `Your subscription for ${org.name} renews in ${daysLeft} days (${periodEnd}). Amount: ৳${sub.amount_bdt?.toLocaleString()}.`,
            type: "system",
            priority: daysLeft === 3 ? "high" : "normal",
            link: "/settings?tab=billing",
            group_key: `renewal_${sub.org_id}_${periodEnd}`,
          });
          reminders++;
        }
      }

      // Auto-generate invoice 10 days before renewal
      if (periodEnd <= in10Days && periodEnd > today) {
        const nextStart = periodEnd;
        const nextEndDate = new Date(new Date(periodEnd).getTime() + (sub.billing_cycle === "yearly" ? 365 : 30) * 86400000);
        const nextEnd = nextEndDate.toISOString().slice(0, 10);

        // Check if invoice already exists for this period
        const { data: existingInv } = await supabase
          .from("platform_invoices")
          .select("id")
          .eq("org_id", sub.org_id)
          .eq("period_start", nextStart)
          .limit(1);

        if (!existingInv?.length) {
          const invNum = `INV-${sub.org_id.slice(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
          const dueDate = periodEnd; // Due on renewal date

          await supabase.from("platform_invoices").insert({
            org_id: sub.org_id,
            invoice_number: invNum,
            amount_bdt: sub.amount_bdt,
            period_start: nextStart,
            period_end: nextEnd,
            status: "sent",
            due_date: dueDate,
          });
          invoicesGenerated++;
        }
      }

      // Mark subscription overdue if period ended and not paid
      if (periodEnd < today && sub.payment_status !== "paid") {
        if (sub.payment_status !== "overdue") {
          await supabase
            .from("organization_subscriptions")
            .update({ payment_status: "overdue", updated_at: now.toISOString() })
            .eq("id", sub.id);
          overdueMarked++;
        }

        // Suspend org if overdue beyond grace period
        const graceDays = org.grace_period_days ?? 7;
        const periodEndMs = new Date(periodEnd).getTime();
        const graceMs = graceDays * 86400000;

        if (Date.now() > periodEndMs + graceMs && org.status === "active") {
          await supabase
            .from("organizations")
            .update({
              status: "suspended",
              suspension_reason: "Subscription payment overdue (auto-suspended)",
              status_changed_at: now.toISOString(),
            })
            .eq("id", sub.org_id);

          // Notify owner
          await supabase.from("notifications").insert({
            user_id: ownerId,
            title: "Agency Suspended ⚠️",
            body: `${org.name} has been suspended due to overdue subscription payment. Please renew to restore access.`,
            type: "system",
            priority: "urgent",
            link: "/settings?tab=billing",
          });

          suspended++;
        }
      }
    }

    // 2. Mark sent invoices as overdue if past due_date
    const { data: sentInvoices } = await supabase
      .from("platform_invoices")
      .select("id")
      .eq("status", "sent")
      .lt("due_date", today);

    if (sentInvoices?.length) {
      const ids = sentInvoices.map((i: any) => i.id);
      for (const id of ids) {
        await supabase
          .from("platform_invoices")
          .update({ status: "overdue" })
          .eq("id", id);
        invoicesOverdue++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        reminders,
        invoicesGenerated,
        overdueMarked,
        suspended,
        invoicesOverdue,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
