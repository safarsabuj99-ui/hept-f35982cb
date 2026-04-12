import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // Try free API for BDT/USD rate
    let rate: number | null = null;
    let source = "api";

    try {
      const resp = await fetch("https://open.er-api.com/v6/latest/USD");
      if (resp.ok) {
        const data = await resp.json();
        rate = data?.rates?.BDT || null;
      }
    } catch {
      // API failed, use manual fallback
    }

    if (!rate) {
      // Fallback: get latest manual rate
      const { data: existing } = await supabase.from("currency_rates")
        .select("rate").eq("from_currency", "USD").eq("to_currency", "BDT")
        .order("updated_at", { ascending: false }).limit(1).single();
      rate = existing?.rate || 120;
      source = "manual_fallback";
    }

    // Insert new rate record
    await supabase.from("currency_rates").insert({
      from_currency: "USD", to_currency: "BDT", rate, source,
    });

    return new Response(JSON.stringify({ ok: true, rate, source }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
