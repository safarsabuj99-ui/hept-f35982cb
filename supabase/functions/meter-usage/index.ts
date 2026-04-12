import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { org_id, metric_type, value } = await req.json();
    if (!org_id || !metric_type || value === undefined) {
      return new Response(JSON.stringify({ error: "Missing org_id, metric_type, or value" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const billingPeriod = new Date().toISOString().slice(0, 7) + "-01";

    const { error } = await supabase.from("usage_metering_logs").insert({
      org_id, metric_type, value, billing_period: billingPeriod,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
