import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const { snapshots, current_mrr } = await req.json();

    const prompt = `You are a revenue forecasting engine. Given historical MRR snapshots and current MRR, project the next 12 months.

Historical MRR snapshots: ${JSON.stringify(snapshots)}
Current MRR (BDT): ${current_mrr}

Return a JSON array of 12 objects with:
- month: "Mon YY" format (next 12 months starting from now)
- projected_mrr: number
- confidence_low: number (lower bound)
- confidence_high: number (upper bound)

Consider trends, seasonality, and typical SaaS growth patterns.
If no historical data, assume modest 5% monthly growth.
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

    let forecasts;
    try {
      forecasts = JSON.parse(content.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    } catch {
      forecasts = [];
    }

    return new Response(JSON.stringify({ forecasts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("revenue-forecast error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
