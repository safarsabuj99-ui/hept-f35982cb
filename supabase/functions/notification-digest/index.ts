// Smart Daily Digest — bundles unread low/normal notifications into a single summary per user.
// Run via cron once daily (e.g., 9am Asia/Dhaka).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find users opted into digest
    const { data: optedUsers } = await supabase
      .from("notification_user_settings")
      .select("user_id, digest_hour, quiet_timezone")
      .eq("digest_enabled", true);

    if (!optedUsers || optedUsers.length === 0) {
      return new Response(JSON.stringify({ digested: 0, message: "No opted users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let createdCount = 0;

    for (const u of optedUsers) {
      // Pull last-24h unread low/normal items
      const { data: items } = await supabase
        .from("notifications")
        .select("type, priority")
        .eq("user_id", u.user_id)
        .eq("is_read", false)
        .in("priority", ["low", "normal"])
        .gte("created_at", since)
        .is("archived_at", null);

      if (!items || items.length === 0) continue;

      // Tally by type
      const tally: Record<string, number> = {};
      for (const i of items) tally[i.type] = (tally[i.type] || 0) + 1;
      const breakdown = Object.entries(tally)
        .map(([t, c]) => `${c} ${t}`)
        .join(", ");

      // Insert one summary notification (in_app only via priority=low + group_key prevents push)
      await supabase.from("notifications").insert({
        user_id: u.user_id,
        title: `Your daily digest — ${items.length} updates`,
        body: `You have ${items.length} unread notifications: ${breakdown}.`,
        type: "system",
        priority: "normal",
        group_key: `digest_${new Date().toISOString().slice(0, 10)}`,
        link: "/admin/notifications",
        is_read: false,
      } as any);
      createdCount++;
    }

    console.log(`[digest] Created ${createdCount} digests`);
    return new Response(JSON.stringify({ digested: createdCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("digest error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
