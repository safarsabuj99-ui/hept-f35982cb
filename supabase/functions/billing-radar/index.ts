import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all active threshold_postpaid accounts
    const { data: accounts, error: accError } = await supabaseAdmin
      .from("ad_accounts")
      .select("id, ad_account_id, client_id, billing_type, threshold_limit, current_threshold_spend, next_billing_date, platform_name")
      .eq("is_active", true);

    if (accError) throw accError;

    const todayStr = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Dhaka" }).split(" ")[0];
    const today = new Date(todayStr + "T00:00:00+06:00");
    const notifications: any[] = [];

    for (const acc of accounts ?? []) {
      // --- Threshold Proximity Alert (80% rule) ---
      if (
        acc.billing_type === "threshold_postpaid" &&
        acc.threshold_limit &&
        acc.threshold_limit > 0
      ) {
        const usagePct = (acc.current_threshold_spend / acc.threshold_limit) * 100;

        if (usagePct >= 80) {
          // Check for duplicate today
          const { data: existing } = await supabaseAdmin
            .from("billing_notifications")
            .select("id")
            .eq("ad_account_id", acc.id)
            .eq("alert_type", "threshold_proximity")
            .gte("created_at", todayStr + "T00:00:00Z")
            .limit(1);

          if (!existing || existing.length === 0) {
            notifications.push({
              ad_account_id: acc.id,
              client_id: acc.client_id,
              alert_type: "threshold_proximity",
              priority: "high",
              message: `⚠️ Payment Alert: Account ${acc.ad_account_id} (${acc.platform_name}) is at ${Math.round(usagePct)}% of threshold ($${acc.current_threshold_spend}/$${acc.threshold_limit}). Prepare funds now.`,
              usage_percent: Math.round(usagePct * 100) / 100,
            });
          }
        }
      }

      // --- Bill Date Countdown (2-day rule) ---
      if (acc.next_billing_date) {
        const billDate = new Date(acc.next_billing_date);
        const diffMs = billDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays >= 0 && diffDays <= 2) {
          const { data: existing } = await supabaseAdmin
            .from("billing_notifications")
            .select("id")
            .eq("ad_account_id", acc.id)
            .eq("alert_type", "bill_date_countdown")
            .gte("created_at", todayStr + "T00:00:00Z")
            .limit(1);

          if (!existing || existing.length === 0) {
            const dayLabel = diffDays === 0 ? "today" : diffDays === 1 ? "tomorrow" : `in ${diffDays} days`;
            notifications.push({
              ad_account_id: acc.id,
              client_id: acc.client_id,
              alert_type: "bill_date_countdown",
              priority: diffDays === 0 ? "high" : "medium",
              message: `📅 Upcoming Bill: Account ${acc.ad_account_id} (${acc.platform_name}) will be charged ${dayLabel} on ${acc.next_billing_date}.`,
              usage_percent: null,
            });
          }
        }
      }
    }

    if (notifications.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("billing_notifications")
        .insert(notifications);
      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        accounts_checked: accounts?.length ?? 0,
        notifications_created: notifications.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
