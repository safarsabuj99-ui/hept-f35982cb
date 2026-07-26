// Auto-recovery endpoint for pushsubscriptionchange events fired by the SW.
// No auth: the (endpoint, keys) pair itself is the identity. We look up the
// old endpoint's user_id and upsert the new one under the same user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { old_endpoint, endpoint, keys_p256dh, keys_auth } = await req.json();
    if (!endpoint || !keys_p256dh || !keys_auth) {
      return new Response(JSON.stringify({ error: "endpoint and keys required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let userId: string | null = null;
    if (old_endpoint) {
      const { data } = await supabase
        .from("push_subscriptions")
        .select("user_id")
        .eq("endpoint", old_endpoint)
        .maybeSingle();
      userId = data?.user_id ?? null;
      if (userId) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", old_endpoint);
      }
    }

    if (!userId) {
      // Can't attribute — nothing to do. Foreground mount will re-subscribe under a known user.
      return new Response(JSON.stringify({ ok: true, orphan: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("push_subscriptions").upsert(
      { user_id: userId, endpoint, keys_p256dh, keys_auth },
      { onConflict: "user_id,endpoint" },
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
