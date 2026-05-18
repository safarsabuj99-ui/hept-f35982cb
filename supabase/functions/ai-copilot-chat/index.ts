// AI Copilot streaming chat — supports OpenAI, Anthropic, Gemini, and Lovable AI fallback.
// Persists messages to ai_messages and logs usage to ai_usage_log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Provider = "openai" | "anthropic" | "gemini" | "lovable";
type Msg = { role: "user" | "assistant" | "system"; content: string };

const SYSTEM_PROMPTS: Record<string, string> = {
  coach: `You are an elite digital marketing agency growth coach. Help the agency owner make their business more profitable: pricing, packaging, client acquisition, retention, scaling teams, niching, cash-flow.
- Be concrete and tactical. Use numbers, examples, frameworks.
- Push back on weak ideas. Be a peer, not a cheerleader.
- Markdown formatting. Bullet lists. Short sections.`,
  analyst: `You are a senior performance marketing analyst for a Bangladesh-based digital agency.
- Help analyze ad campaigns: ROAS, CPM, CTR, CPA, profit.
- Currency: spend in USD, client revenue in BDT (৳).
- When asked about specific clients/campaigns, you currently do NOT have direct DB access (tools coming in Phase 2). Ask the user to paste numbers, or share a screenshot.
- Always give concrete actions: pause, scale, reallocate, fix creative.`,
  copy: `You are a world-class direct-response ad copywriter fluent in Bangla and English.
- Write hooks, headlines, primary text, CTAs.
- Match the platform (Facebook, Instagram, TikTok, Google).
- Match the niche (fashion, e-commerce, restaurant, real estate, etc.).
- Default to Banglish/English unless asked for pure Bangla. Multiple variants.`,
  comms: `You help an agency owner write client communication.
- Drafts performance recaps, follow-up emails, WhatsApp updates.
- Friendly-professional tone. Bilingual when relevant.
- Always: clear subject, short body, single CTA.`,
};

async function getCallerOrg(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("org_id").eq("user_id", userId).single();
  return data?.org_id ?? null;
}

async function getProviderKey(serviceClient: any, orgId: string, provider: Provider): Promise<{ key?: string; default_model?: string; budget?: number; usage?: number } | null> {
  if (provider === "lovable") return { key: Deno.env.get("LOVABLE_API_KEY") || "", default_model: "google/gemini-3-flash-preview" };
  const { data } = await serviceClient.rpc("get_ai_provider_config", { _org_id: orgId, _provider: provider });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.api_key) return null;
  return { key: row.api_key, default_model: row.default_model, budget: Number(row.monthly_budget_usd), usage: Number(row.usage_this_month_usd) };
}

// ---- Provider streaming (returns plain text stream) ----

async function* streamOpenAI(key: string, model: string, messages: Msg[]) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!r.ok || !r.body) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data);
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) yield delta as string;
      } catch { /* ignore */ }
    }
  }
}

async function* streamAnthropic(key: string, model: string, messages: Msg[]) {
  const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const conv = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 2048, system: sys || undefined, messages: conv, stream: true }),
  });
  if (!r.ok || !r.body) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      try {
        const j = JSON.parse(t.slice(5).trim());
        if (j.type === "content_block_delta" && j.delta?.text) yield j.delta.text as string;
      } catch { /* ignore */ }
    }
  }
}

async function* streamGemini(key: string, model: string, messages: Msg[]) {
  const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
      contents,
    }),
  });
  if (!r.ok || !r.body) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      try {
        const j = JSON.parse(t.slice(5).trim());
        const txt = j.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
        if (txt) yield txt as string;
      } catch { /* ignore */ }
    }
  }
}

async function* streamLovable(key: string, model: string, messages: Msg[]) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!r.ok || !r.body) {
    if (r.status === 429) throw new Error("Lovable AI: rate limit exceeded. Try again shortly.");
    if (r.status === 402) throw new Error("Lovable AI: workspace credits exhausted. Add credits in Settings → Workspace → Usage.");
    throw new Error(`Lovable AI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data);
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) yield delta as string;
      } catch { /* ignore */ }
    }
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
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const orgId = await getCallerOrg(supabase, user.id);
    if (!orgId) return new Response(JSON.stringify({ error: "No org for user" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const threadId: string = body.thread_id;
    const provider: Provider = body.provider || "lovable";
    let model: string = body.model || "";
    const mode: string = body.mode || "coach";
    const userText: string = String(body.text || "").trim();
    if (!threadId || !userText) return new Response(JSON.stringify({ error: "thread_id and text required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Verify the thread belongs to user
    const { data: thread } = await supabase.from("ai_threads").select("id, user_id, org_id").eq("id", threadId).single();
    if (!thread || thread.user_id !== user.id) return new Response(JSON.stringify({ error: "Thread not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Load provider config
    const cfg = await getProviderKey(service, orgId, provider);
    if (!cfg?.key) return new Response(JSON.stringify({ error: `No API key configured for ${provider}. Add one in Settings → AI Providers.` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Budget check
    if (provider !== "lovable" && cfg.budget != null && cfg.usage != null && cfg.usage >= cfg.budget) {
      return new Response(JSON.stringify({ error: `Monthly budget for ${provider} ($${cfg.budget}) is reached. Raise it in Settings → AI Providers.` }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!model) model = cfg.default_model || (provider === "openai" ? "gpt-4o-mini" : provider === "anthropic" ? "claude-3-5-sonnet-latest" : provider === "gemini" ? "gemini-2.5-flash" : "google/gemini-3-flash-preview");

    // Load history (last 30 messages for context)
    const { data: history } = await supabase
      .from("ai_messages")
      .select("role, parts")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(30);

    const historyMsgs: Msg[] = (history || [])
      .map((m: any) => {
        const text = Array.isArray(m.parts)
          ? m.parts.filter((p: any) => p?.type === "text").map((p: any) => p.text).join("")
          : "";
        return { role: m.role === "assistant" ? "assistant" : "user", content: text } as Msg;
      })
      .filter((m) => m.content.length > 0);

    const system = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.coach;
    const messages: Msg[] = [{ role: "system", content: system }, ...historyMsgs, { role: "user", content: userText }];

    // Persist user message
    await service.from("ai_messages").insert({
      thread_id: threadId, org_id: orgId, role: "user",
      parts: [{ type: "text", text: userText }],
    });

    // If first message, title the thread from first 60 chars
    const { count } = await service.from("ai_messages").select("id", { count: "exact", head: true }).eq("thread_id", threadId);
    if ((count || 0) <= 1) {
      const title = userText.slice(0, 60) + (userText.length > 60 ? "…" : "");
      await service.from("ai_threads").update({ title, provider, model, updated_at: new Date().toISOString() }).eq("id", threadId);
    } else {
      await service.from("ai_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
    }

    // Pick stream
    const streamFn =
      provider === "openai" ? streamOpenAI :
      provider === "anthropic" ? streamAnthropic :
      provider === "gemini" ? streamGemini :
      streamLovable;

    const encoder = new TextEncoder();
    let assistantText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamFn(cfg.key!, model, messages)) {
            assistantText += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (e) {
          const msg = `\n\n[Error: ${e instanceof Error ? e.message : String(e)}]`;
          assistantText += msg;
          controller.enqueue(encoder.encode(msg));
        } finally {
          // Persist assistant message
          try {
            await service.from("ai_messages").insert({
              thread_id: threadId, org_id: orgId, role: "assistant",
              parts: [{ type: "text", text: assistantText }],
              provider, model,
            });
          } catch { /* ignore persistence errors */ }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8", "X-Provider": provider, "X-Model": model },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
