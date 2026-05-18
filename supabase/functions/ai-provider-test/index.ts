// Validates an AI provider API key by making a tiny test call.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Provider = "openai" | "anthropic" | "gemini";

async function testKey(provider: Provider, key: string): Promise<{ ok: boolean; error?: string; models?: string[] }> {
  try {
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) return { ok: false, error: `OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}` };
      const j = await r.json();
      return { ok: true, models: (j.data || []).map((m: any) => m.id).slice(0, 200) };
    }
    if (provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      });
      if (!r.ok) return { ok: false, error: `Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}` };
      const j = await r.json();
      return { ok: true, models: (j.data || []).map((m: any) => m.id) };
    }
    if (provider === "gemini") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
      if (!r.ok) return { ok: false, error: `Gemini ${r.status}: ${(await r.text()).slice(0, 200)}` };
      const j = await r.json();
      return {
        ok: true,
        models: (j.models || [])
          .map((m: any) => String(m.name || "").replace(/^models\//, ""))
          .filter((n: string) => n.includes("gemini")),
      };
    }
    return { ok: false, error: "Unknown provider" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const provider = body?.provider as Provider;
    const key = String(body?.api_key || "").trim();
    if (!provider || !key) return new Response(JSON.stringify({ error: "provider and api_key required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const result = await testKey(provider, key);
    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
