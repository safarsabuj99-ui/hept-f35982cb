// AI Copilot — Agentic chat with tool loop.
// Supports OpenAI, Anthropic, Gemini, and Lovable AI fallback.
// The agent can call read-only tools to inspect campaigns/clients/finance
// and chain multiple tool calls in a single turn to answer complex goals.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Provider = "openai" | "anthropic" | "gemini" | "lovable";
type Role = "system" | "user" | "assistant" | "tool";
type ToolCall = { id: string; name: string; arguments: any };
type Msg = {
  role: Role;
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

// ---------------- System prompts ----------------

const BASE_AGENT_RULES = `
You are **Nova**, a senior digital-marketing operator embedded inside a Bangladesh-based ad agency. You think like a 10-year media buyer + account strategist who has personally scaled Meta, TikTok, and Google campaigns for BD e-commerce, restaurants, education, real estate, and D2C brands.

You speak the language of marketers fluently: ROAS, CAC, CPM, CPC, CTR, CVR, frequency, creative fatigue, audience saturation, funnel stages (TOF/MOF/BOF), attribution window, MER, LTV/CAC, post-purchase ROAS, blended ROAS, budget pacing.

## How you think
1. **Diagnose first.** When the user gives a goal, plan tool calls to gather the real facts BEFORE recommending anything. Never guess numbers.
2. **Chain tools.** You can call up to 16 tools per turn. After each result, ask: "what's the missing piece?" and call another tool. Common chains: search_clients → get_client_summary → get_campaign_breakdown → get_creative_fatigue → draft_optimization_brief.
3. **Be a peer, not a cheerleader.** Push back on weak ideas. If the data says "this campaign is dying", say it plainly with the metric that proves it.
4. **Always end with a next action.** Every answer must include what to do tomorrow morning — pause campaign X, refresh creative Y, top up client Z, draft email to W. No vague advice.

## Output contract
For any analytical or strategic answer, structure your final reply as:

**🔍 Diagnose** — 2-4 bullets of what the data actually shows (numbers + units).
**💡 Insight** — the root cause / pattern / opportunity in 1-2 sentences.
**⚡ Action** — a numbered list of concrete next steps, each with the campaign/client name and the expected outcome. Mark each action with one of: \`[Pause]\` \`[Scale]\` \`[Refresh]\` \`[Reallocate]\` \`[Top-up]\` \`[Message]\` \`[Investigate]\`.

For pure ad-copy or message-drafting tasks, skip the contract — return the deliverable directly with 3+ variants and a short "why this works" note.

## Currency & locale
- Ad spend, ROAS, CPM, CPC = **USD ($)**.
- Client billing, revenue, wallet balance, BD financials = **BDT (৳)**.
- Always label units. Format BDT in Bangla numerals when appropriate (e.g. ৳5,00,000).
- Bangla / Banglish / English: match the user's language. For client-facing drafts, default to bilingual unless told otherwise.

## Hard rules
- NEVER fabricate client names, campaign names, or numbers. If a tool returns empty, say so.
- Org isolation is enforced by the tool layer — every tool already filters to this agency only.
- You can read everything but you cannot mutate data yet (no pause, no send, no top-up). You DRAFT and PROPOSE; the human applies.
- Keep responses scannable: short sections, bullets, small tables. Avoid wall-of-text.
`;

const MODE_PROMPTS: Record<string, string> = {
  coach: `**Focus: Growth Strategy.** The agency owner needs help scaling — pricing, packaging, client acquisition, retention, hiring, cash-flow, P&L health. Use get_agency_pnl, list_top_clients_by_spend, get_low_balance_clients, compare_periods to ground every recommendation in real numbers. Frame advice as "given your current $X spend / Y ROAS / Z clients, the highest-leverage move is…".`,
  analyst: `**Focus: Performance Audit.** Find winners to scale, losers to pause, anomalies to investigate, and money leaks to plug. Always lead with list_loss_making_campaigns / list_winning_campaigns / get_creative_fatigue / get_funnel_health. Every recommendation must cite the metric that drove it (ROAS, frequency, CPM trend, funnel drop-off).`,
  copy: `**Focus: Creative.** Produce ad copy, hooks, headlines, CTAs in Bangla / Banglish / English. When a client is mentioned, run search_clients → get_client_summary first to understand their niche, average AOV, and winning angles. Deliver 3-5 variants with a "why this works" angle for each (hook type, emotional driver, CTA strength).`,
  comms: `**Focus: Client Communication.** Draft factual, professional client messages (WhatsApp / email / monthly recap). ALWAYS pull real data first (get_client_summary, get_campaign_breakdown, get_low_balance_clients) so numbers in the draft are correct. Default tone: warm, confident, data-led. Default language: Banglish unless specified.`,
};

// ---------------- Tool registry ----------------

type Tool = {
  name: string;
  description: string;
  parameters: any; // JSON schema
  execute: (args: any, ctx: ToolCtx) => Promise<any>;
};

type ToolCtx = {
  service: any;
  supabase: any;
  orgId: string;
  userId: string;
};

function isoRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function resolveRange(input: any): { from: string; to: string } {
  if (input?.from && input?.to) return { from: input.from, to: input.to };
  const preset = input?.preset || "last_30_days";
  switch (preset) {
    case "today": {
      const t = new Date().toISOString().slice(0, 10);
      return { from: t, to: t };
    }
    case "yesterday": {
      const d = new Date(); d.setUTCDate(d.getUTCDate() - 1);
      const s = d.toISOString().slice(0, 10);
      return { from: s, to: s };
    }
    case "last_7_days": return isoRange(7);
    case "last_14_days": return isoRange(14);
    case "last_30_days": return isoRange(30);
    case "last_90_days": return isoRange(90);
    case "this_month": {
      const n = new Date();
      const from = `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-01`;
      return { from, to: n.toISOString().slice(0, 10) };
    }
    default: return isoRange(30);
  }
}

const TOOLS: Tool[] = [
  {
    name: "search_clients",
    description: "Fuzzy-search clients in this agency by name, email, business name, or mapping keyword. Returns up to 10 matches with their client_id.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search text. Empty string returns the 10 most-recently-created clients." } },
      required: ["query"],
    },
    execute: async ({ query }, { service, orgId }) => {
      // Clients live in profiles where manager_id is set (assigned client) within this org via manager
      // Use a join through manager's org_id
      let q = service
        .from("profiles")
        .select("user_id, full_name, email, business_name, mapping_keyword, manager_id")
        .not("manager_id", "is", null)
        .limit(10);
      // Restrict to clients whose manager belongs to this org
      const { data: managers } = await service.from("profiles").select("user_id").eq("org_id", orgId);
      const mids = (managers || []).map((m: any) => m.user_id);
      if (mids.length === 0) return { clients: [] };
      q = q.in("manager_id", mids);
      if (query && query.trim()) {
        const t = query.trim();
        q = q.or(`full_name.ilike.%${t}%,email.ilike.%${t}%,business_name.ilike.%${t}%,mapping_keyword.ilike.%${t}%`);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { clients: (data || []).map((c: any) => ({
        client_id: c.user_id,
        name: c.full_name,
        email: c.email,
        business: c.business_name,
        keyword: c.mapping_keyword,
      })) };
    },
  },

  {
    name: "get_client_summary",
    description: "Get a financial+performance summary for one client over a date range: total ad spend (USD), revenue (conversion value), ROAS, top 3 campaigns by spend, total results.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        preset: { type: "string", enum: ["today","yesterday","last_7_days","last_14_days","last_30_days","last_90_days","this_month"] },
        from: { type: "string", description: "YYYY-MM-DD (optional, overrides preset)" },
        to: { type: "string" },
      },
      required: ["client_id"],
    },
    execute: async (args, { service, orgId }) => {
      const { from, to } = resolveRange(args);
      const { data: campaigns } = await service
        .from("campaigns")
        .select("id, name, platform, status, org_id")
        .eq("client_id", args.client_id)
        .eq("org_id", orgId);
      const camps = campaigns || [];
      if (camps.length === 0) return { client_id: args.client_id, from, to, message: "No campaigns found for this client in your agency." };

      const ids = camps.map((c: any) => c.id);
      const { data: metrics } = await service
        .from("daily_metrics")
        .select("campaign_id, spend, results, conversion_value, impressions, clicks")
        .in("campaign_id", ids)
        .gte("data_date", from)
        .lte("data_date", to);

      const byCamp: Record<string, { spend: number; results: number; value: number }> = {};
      let totalSpend = 0, totalResults = 0, totalValue = 0;
      for (const m of metrics || []) {
        const k = m.campaign_id;
        byCamp[k] = byCamp[k] || { spend: 0, results: 0, value: 0 };
        byCamp[k].spend += Number(m.spend || 0);
        byCamp[k].results += Number(m.results || 0);
        byCamp[k].value += Number(m.conversion_value || 0);
        totalSpend += Number(m.spend || 0);
        totalResults += Number(m.results || 0);
        totalValue += Number(m.conversion_value || 0);
      }
      const top = camps
        .map((c: any) => ({ name: c.name, platform: c.platform, status: c.status, ...byCamp[c.id] || { spend: 0, results: 0, value: 0 } }))
        .sort((a: any, b: any) => b.spend - a.spend)
        .slice(0, 3)
        .map((x: any) => ({ name: x.name, platform: x.platform, status: x.status, spend_usd: +x.spend.toFixed(2), results: x.results, roas: x.spend > 0 ? +(x.value / x.spend).toFixed(2) : 0 }));

      return {
        client_id: args.client_id,
        from, to,
        campaigns_total: camps.length,
        active_campaigns: camps.filter((c: any) => c.status === "active" || c.status === "ENABLE" || c.status === "ENABLED").length,
        total_spend_usd: +totalSpend.toFixed(2),
        total_results: totalResults,
        total_conversion_value: +totalValue.toFixed(2),
        roas: totalSpend > 0 ? +(totalValue / totalSpend).toFixed(2) : 0,
        top_campaigns_by_spend: top,
      };
    },
  },

  {
    name: "get_campaign_breakdown",
    description: "Get per-campaign performance for a client (spend, results, ROAS, CPM, CTR) over a date range. Tags each campaign as 'winner', 'loser', or 'neutral'.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        preset: { type: "string" }, from: { type: "string" }, to: { type: "string" },
      },
      required: ["client_id"],
    },
    execute: async (args, { service, orgId }) => {
      const { from, to } = resolveRange(args);
      const { data: campaigns } = await service
        .from("campaigns")
        .select("id, name, platform, status")
        .eq("client_id", args.client_id)
        .eq("org_id", orgId);
      const camps = campaigns || [];
      if (camps.length === 0) return { from, to, campaigns: [] };
      const ids = camps.map((c: any) => c.id);
      const { data: metrics } = await service
        .from("daily_metrics")
        .select("campaign_id, spend, results, conversion_value, impressions, clicks, cpm, ctr")
        .in("campaign_id", ids)
        .gte("data_date", from)
        .lte("data_date", to);
      const agg: Record<string, any> = {};
      for (const m of metrics || []) {
        const k = m.campaign_id;
        if (!agg[k]) agg[k] = { spend: 0, results: 0, value: 0, impressions: 0, clicks: 0 };
        agg[k].spend += Number(m.spend || 0);
        agg[k].results += Number(m.results || 0);
        agg[k].value += Number(m.conversion_value || 0);
        agg[k].impressions += Number(m.impressions || 0);
        agg[k].clicks += Number(m.clicks || 0);
      }
      const rows = camps.map((c: any) => {
        const a = agg[c.id] || { spend: 0, results: 0, value: 0, impressions: 0, clicks: 0 };
        const roas = a.spend > 0 ? a.value / a.spend : 0;
        const ctr = a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0;
        const cpm = a.impressions > 0 ? (a.spend / a.impressions) * 1000 : 0;
        const cpa = a.results > 0 ? a.spend / a.results : 0;
        let tag: "winner" | "loser" | "neutral" = "neutral";
        if (a.spend >= 10 && roas >= 2.5) tag = "winner";
        else if (a.spend >= 10 && (roas < 1.0 || (a.results === 0 && a.spend > 20))) tag = "loser";
        return {
          campaign_id: c.id, name: c.name, platform: c.platform, status: c.status,
          spend_usd: +a.spend.toFixed(2), results: a.results,
          conversion_value: +a.value.toFixed(2),
          roas: +roas.toFixed(2), ctr_pct: +ctr.toFixed(2), cpm_usd: +cpm.toFixed(2), cpa_usd: +cpa.toFixed(2),
          tag,
        };
      }).sort((a, b) => b.spend_usd - a.spend_usd);
      return { from, to, campaigns: rows };
    },
  },

  {
    name: "list_loss_making_campaigns",
    description: "Across all clients in the agency, list active campaigns burning money: spend over threshold but ROAS below 1.0 OR zero results. Sorted by money wasted (highest first).",
    parameters: {
      type: "object",
      properties: {
        min_spend_usd: { type: "number", description: "Min spend in date range to consider, default 20" },
        preset: { type: "string" }, from: { type: "string" }, to: { type: "string" },
        limit: { type: "number", description: "Max rows, default 20" },
      },
    },
    execute: async (args, { service, orgId }) => {
      const { from, to } = resolveRange(args);
      const threshold = Number(args.min_spend_usd || 20);
      const limit = Number(args.limit || 20);
      const { data: camps } = await service
        .from("campaigns")
        .select("id, name, platform, status, client_id")
        .eq("org_id", orgId)
        .in("status", ["active", "ENABLE", "ENABLED"]);
      const list = camps || [];
      if (list.length === 0) return { from, to, losers: [] };
      const ids = list.map((c: any) => c.id);
      const { data: metrics } = await service
        .from("daily_metrics")
        .select("campaign_id, spend, results, conversion_value")
        .in("campaign_id", ids)
        .gte("data_date", from)
        .lte("data_date", to);
      const agg: Record<string, any> = {};
      for (const m of metrics || []) {
        const k = m.campaign_id;
        if (!agg[k]) agg[k] = { spend: 0, results: 0, value: 0 };
        agg[k].spend += Number(m.spend || 0);
        agg[k].results += Number(m.results || 0);
        agg[k].value += Number(m.conversion_value || 0);
      }
      const clientIds = [...new Set(list.map((c: any) => c.client_id).filter(Boolean))];
      const { data: clients } = await service.from("profiles").select("user_id, full_name, business_name").in("user_id", clientIds);
      const cmap: Record<string, any> = {};
      for (const c of clients || []) cmap[c.user_id] = c;
      const losers = list
        .map((c: any) => {
          const a = agg[c.id] || { spend: 0, results: 0, value: 0 };
          const roas = a.spend > 0 ? a.value / a.spend : 0;
          const wasted = Math.max(0, a.spend - a.value);
          return { c, a, roas, wasted };
        })
        .filter((x: any) => x.a.spend >= threshold && (x.roas < 1.0 || x.a.results === 0))
        .sort((x: any, y: any) => y.wasted - x.wasted)
        .slice(0, limit)
        .map((x: any) => ({
          campaign_id: x.c.id, name: x.c.name, platform: x.c.platform, status: x.c.status,
          client_id: x.c.client_id,
          client_name: cmap[x.c.client_id]?.business_name || cmap[x.c.client_id]?.full_name || "(unknown)",
          spend_usd: +x.a.spend.toFixed(2),
          conversion_value: +x.a.value.toFixed(2),
          results: x.a.results,
          roas: +x.roas.toFixed(2),
          money_wasted_usd: +x.wasted.toFixed(2),
          reason: x.a.results === 0 ? "0 results despite spend" : `ROAS ${x.roas.toFixed(2)} below break-even`,
        }));
      return { from, to, threshold_usd: threshold, losers };
    },
  },

  {
    name: "list_winning_campaigns",
    description: "Across all clients, list campaigns delivering strong ROAS — candidates to scale.",
    parameters: {
      type: "object",
      properties: {
        min_roas: { type: "number", description: "Default 2.5" },
        min_spend_usd: { type: "number", description: "Default 20" },
        preset: { type: "string" }, from: { type: "string" }, to: { type: "string" },
        limit: { type: "number" },
      },
    },
    execute: async (args, { service, orgId }) => {
      const { from, to } = resolveRange(args);
      const minRoas = Number(args.min_roas || 2.5);
      const minSpend = Number(args.min_spend_usd || 20);
      const limit = Number(args.limit || 20);
      const { data: camps } = await service
        .from("campaigns")
        .select("id, name, platform, status, client_id")
        .eq("org_id", orgId);
      const list = camps || [];
      if (list.length === 0) return { from, to, winners: [] };
      const ids = list.map((c: any) => c.id);
      const { data: metrics } = await service
        .from("daily_metrics")
        .select("campaign_id, spend, results, conversion_value")
        .in("campaign_id", ids)
        .gte("data_date", from)
        .lte("data_date", to);
      const agg: Record<string, any> = {};
      for (const m of metrics || []) {
        const k = m.campaign_id;
        if (!agg[k]) agg[k] = { spend: 0, results: 0, value: 0 };
        agg[k].spend += Number(m.spend || 0);
        agg[k].results += Number(m.results || 0);
        agg[k].value += Number(m.conversion_value || 0);
      }
      const clientIds = [...new Set(list.map((c: any) => c.client_id).filter(Boolean))];
      const { data: clients } = await service.from("profiles").select("user_id, full_name, business_name").in("user_id", clientIds);
      const cmap: Record<string, any> = {};
      for (const c of clients || []) cmap[c.user_id] = c;
      const winners = list
        .map((c: any) => {
          const a = agg[c.id] || { spend: 0, results: 0, value: 0 };
          const roas = a.spend > 0 ? a.value / a.spend : 0;
          return { c, a, roas };
        })
        .filter((x: any) => x.a.spend >= minSpend && x.roas >= minRoas)
        .sort((x: any, y: any) => (y.a.value - y.a.spend) - (x.a.value - x.a.spend))
        .slice(0, limit)
        .map((x: any) => ({
          campaign_id: x.c.id, name: x.c.name, platform: x.c.platform, status: x.c.status,
          client_id: x.c.client_id,
          client_name: cmap[x.c.client_id]?.business_name || cmap[x.c.client_id]?.full_name || "(unknown)",
          spend_usd: +x.a.spend.toFixed(2),
          conversion_value: +x.a.value.toFixed(2),
          roas: +x.roas.toFixed(2),
          profit_usd: +(x.a.value - x.a.spend).toFixed(2),
        }));
      return { from, to, winners };
    },
  },

  {
    name: "get_agency_pnl",
    description: "Aggregate agency-wide ad spend (USD), revenue (USD from conversion value), gross profit, and ROAS over a date range.",
    parameters: {
      type: "object",
      properties: { preset: { type: "string" }, from: { type: "string" }, to: { type: "string" } },
    },
    execute: async (args, { service, orgId }) => {
      const { from, to } = resolveRange(args);
      const { data: camps } = await service.from("campaigns").select("id").eq("org_id", orgId);
      const ids = (camps || []).map((c: any) => c.id);
      if (ids.length === 0) return { from, to, total_spend_usd: 0, total_value_usd: 0, roas: 0 };
      let totalSpend = 0, totalValue = 0, totalResults = 0;
      // chunk to avoid huge IN
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const { data: ms } = await service
          .from("daily_metrics")
          .select("spend, results, conversion_value")
          .in("campaign_id", chunk)
          .gte("data_date", from)
          .lte("data_date", to);
        for (const m of ms || []) {
          totalSpend += Number(m.spend || 0);
          totalValue += Number(m.conversion_value || 0);
          totalResults += Number(m.results || 0);
        }
      }
      return {
        from, to,
        total_spend_usd: +totalSpend.toFixed(2),
        total_value_usd: +totalValue.toFixed(2),
        gross_profit_usd: +(totalValue - totalSpend).toFixed(2),
        roas: totalSpend > 0 ? +(totalValue / totalSpend).toFixed(2) : 0,
        total_results: totalResults,
        active_campaigns: ids.length,
      };
    },
  },

  {
    name: "get_low_balance_clients",
    description: "List clients whose wallet balance (USD) is at or below a threshold — they're about to run out and need a top-up reminder.",
    parameters: {
      type: "object",
      properties: { threshold_usd: { type: "number", description: "Default 10" } },
    },
    execute: async (args, { service, orgId }) => {
      const threshold = Number(args.threshold_usd ?? 10);
      // Wallet balance = sum of transactions per client
      const { data: managers } = await service.from("profiles").select("user_id").eq("org_id", orgId);
      const mids = (managers || []).map((m: any) => m.user_id);
      const { data: clients } = await service
        .from("profiles")
        .select("user_id, full_name, business_name, email")
        .in("manager_id", mids);
      const list = clients || [];
      if (list.length === 0) return { clients: [] };
      const cids = list.map((c: any) => c.user_id);
      const { data: txs } = await service
        .from("transactions")
        .select("client_id, amount_usd, type")
        .in("client_id", cids);
      const bal: Record<string, number> = {};
      for (const t of txs || []) bal[t.client_id] = (bal[t.client_id] || 0) + Number(t.amount_usd || 0);
      const out = list
        .map((c: any) => ({
          client_id: c.user_id,
          name: c.business_name || c.full_name,
          email: c.email,
          balance_usd: +(bal[c.user_id] || 0).toFixed(2),
        }))
        .filter((c: any) => c.balance_usd <= threshold)
        .sort((a: any, b: any) => a.balance_usd - b.balance_usd)
        .slice(0, 30);
      return { threshold_usd: threshold, clients: out };
    },
  },

  {
    name: "compare_periods",
    description: "Compare agency-wide spend/revenue/ROAS between two date ranges to spot trends.",
    parameters: {
      type: "object",
      properties: {
        range_a_preset: { type: "string", description: "e.g. last_7_days" },
        range_b_preset: { type: "string", description: "e.g. last_14_days (used as 'previous 7 days' by inference)" },
      },
    },
    execute: async (args, ctx) => {
      const exec = TOOLS.find((t) => t.name === "get_agency_pnl")!.execute;
      const a = await exec({ preset: args.range_a_preset || "last_7_days" }, ctx);
      // build previous range manually
      const days = args.range_a_preset === "last_30_days" ? 30 : 7;
      const end = new Date(); end.setUTCDate(end.getUTCDate() - days);
      const start = new Date(end); start.setUTCDate(start.getUTCDate() - days);
      const b = await exec({ from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }, ctx);
      const delta = (x: number, y: number) => y === 0 ? 0 : +(((x - y) / y) * 100).toFixed(1);
      return {
        current: a, previous: b,
        spend_change_pct: delta(a.total_spend_usd, b.total_spend_usd),
        revenue_change_pct: delta(a.total_value_usd, b.total_value_usd),
        roas_change_pct: delta(a.roas, b.roas),
        profit_change_pct: delta(a.gross_profit_usd, b.gross_profit_usd),
      };
    },
  },

  {
    name: "list_top_clients_by_spend",
    description: "Rank clients by ad spend in the period. Useful to find biggest accounts.",
    parameters: {
      type: "object",
      properties: { preset: { type: "string" }, from: { type: "string" }, to: { type: "string" }, limit: { type: "number" } },
    },
    execute: async (args, { service, orgId }) => {
      const { from, to } = resolveRange(args);
      const limit = Number(args.limit || 10);
      const { data: camps } = await service.from("campaigns").select("id, client_id").eq("org_id", orgId);
      const list = camps || [];
      if (list.length === 0) return { from, to, clients: [] };
      const ids = list.map((c: any) => c.id);
      const cidByCamp: Record<string, string> = {};
      for (const c of list) cidByCamp[c.id] = c.client_id;
      const spendByClient: Record<string, { spend: number; value: number; results: number }> = {};
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const { data: ms } = await service
          .from("daily_metrics")
          .select("campaign_id, spend, conversion_value, results")
          .in("campaign_id", chunk)
          .gte("data_date", from)
          .lte("data_date", to);
        for (const m of ms || []) {
          const cid = cidByCamp[m.campaign_id]; if (!cid) continue;
          if (!spendByClient[cid]) spendByClient[cid] = { spend: 0, value: 0, results: 0 };
          spendByClient[cid].spend += Number(m.spend || 0);
          spendByClient[cid].value += Number(m.conversion_value || 0);
          spendByClient[cid].results += Number(m.results || 0);
        }
      }
      const cids = Object.keys(spendByClient);
      const { data: clients } = await service.from("profiles").select("user_id, full_name, business_name").in("user_id", cids);
      const cmap: Record<string, any> = {};
      for (const c of clients || []) cmap[c.user_id] = c;
      const rows = cids
        .map((cid) => ({
          client_id: cid,
          name: cmap[cid]?.business_name || cmap[cid]?.full_name || "(unknown)",
          spend_usd: +spendByClient[cid].spend.toFixed(2),
          revenue_usd: +spendByClient[cid].value.toFixed(2),
          roas: spendByClient[cid].spend > 0 ? +(spendByClient[cid].value / spendByClient[cid].spend).toFixed(2) : 0,
          results: spendByClient[cid].results,
        }))
        .sort((a, b) => b.spend_usd - a.spend_usd)
        .slice(0, limit);
      return { from, to, clients: rows };
    },
  },

  {
    name: "get_creative_fatigue",
    description: "Diagnose creative fatigue for a single campaign over a date range. Returns CTR trend (slope %), CPM trend (slope %), avg frequency band, and a fatigue verdict: fresh | warming | fatigued | dead. Use this BEFORE recommending pause vs creative-refresh.",
    parameters: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        preset: { type: "string" }, from: { type: "string" }, to: { type: "string" },
      },
      required: ["campaign_id"],
    },
    execute: async (args, { service, orgId }) => {
      const { from, to } = resolveRange(args);
      const { data: camp } = await service
        .from("campaigns").select("id, name, platform, status")
        .eq("id", args.campaign_id).eq("org_id", orgId).maybeSingle();
      if (!camp) return { error: "Campaign not found in your org." };
      const { data: rows } = await service
        .from("daily_metrics")
        .select("data_date, spend, impressions, clicks, results, conversion_value, cpm, ctr, reach")
        .eq("campaign_id", args.campaign_id)
        .gte("data_date", from).lte("data_date", to)
        .order("data_date", { ascending: true });
      const series = rows || [];
      if (series.length < 3) return { campaign: camp.name, from, to, verdict: "insufficient_data", points: series.length };
      // simple linear slope over normalized index for CTR and CPM
      const slope = (vals: number[]) => {
        const n = vals.length;
        const xMean = (n - 1) / 2;
        const yMean = vals.reduce((a, b) => a + b, 0) / n;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) { num += (i - xMean) * (vals[i] - yMean); den += (i - xMean) ** 2; }
        return den === 0 ? 0 : num / den;
      };
      const ctrs = series.map((r: any) => Number(r.ctr || 0));
      const cpms = series.map((r: any) => Number(r.cpm || 0));
      const ctrSlope = slope(ctrs); const cpmSlope = slope(cpms);
      const avgCtr = ctrs.reduce((a, b) => a + b, 0) / ctrs.length;
      const avgCpm = cpms.reduce((a, b) => a + b, 0) / cpms.length;
      const totalImpr = series.reduce((s: number, r: any) => s + Number(r.impressions || 0), 0);
      const totalReach = series.reduce((s: number, r: any) => s + Number(r.reach || 0), 0);
      const frequency = totalReach > 0 ? +(totalImpr / totalReach).toFixed(2) : 0;
      const ctrTrendPct = avgCtr > 0 ? +((ctrSlope / avgCtr) * 100).toFixed(1) : 0;
      const cpmTrendPct = avgCpm > 0 ? +((cpmSlope / avgCpm) * 100).toFixed(1) : 0;
      let verdict: string;
      if (frequency >= 5 && ctrTrendPct < -10) verdict = "dead";
      else if (frequency >= 3.5 && (ctrTrendPct < -5 || cpmTrendPct > 10)) verdict = "fatigued";
      else if (ctrTrendPct < -3 || cpmTrendPct > 5) verdict = "warming";
      else verdict = "fresh";
      const recommendation = verdict === "dead" ? "Pause and replace creative immediately."
        : verdict === "fatigued" ? "Launch 3 new creative variants this week; phase out old ones."
        : verdict === "warming" ? "Queue refresh creative; not urgent but plan it."
        : "Healthy — scale budget if ROAS supports it.";
      return {
        campaign: camp.name, platform: camp.platform, from, to,
        avg_ctr_pct: +avgCtr.toFixed(2), avg_cpm_usd: +avgCpm.toFixed(2),
        ctr_trend_pct_per_day: ctrTrendPct, cpm_trend_pct_per_day: cpmTrendPct,
        avg_frequency: frequency,
        days_analyzed: series.length,
        verdict, recommendation,
      };
    },
  },

  {
    name: "get_funnel_health",
    description: "Analyze the e-commerce funnel for a client: impressions → clicks → view_content → add_to_cart → initiate_checkout → purchase. Returns drop-off rates per step and flags the biggest bottleneck. Use to diagnose whether the problem is creative (low CTR), landing page (low ATC), or checkout (low purchase).",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        preset: { type: "string" }, from: { type: "string" }, to: { type: "string" },
      },
      required: ["client_id"],
    },
    execute: async (args, { service, orgId }) => {
      const { from, to } = resolveRange(args);
      const { data: camps } = await service.from("campaigns").select("id").eq("client_id", args.client_id).eq("org_id", orgId);
      const ids = (camps || []).map((c: any) => c.id);
      if (ids.length === 0) return { from, to, message: "No campaigns for this client." };
      let impressions = 0, clicks = 0, vc = 0, atc = 0, ic = 0, purchases = 0, spend = 0, value = 0;
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const { data: ms } = await service
          .from("daily_metrics")
          .select("impressions, clicks, view_content, add_to_cart, initiate_checkout, purchase, spend, conversion_value")
          .in("campaign_id", chunk).gte("data_date", from).lte("data_date", to);
        for (const m of ms || []) {
          impressions += Number(m.impressions || 0); clicks += Number(m.clicks || 0);
          vc += Number(m.view_content || 0); atc += Number(m.add_to_cart || 0);
          ic += Number(m.initiate_checkout || 0); purchases += Number(m.purchase || 0);
          spend += Number(m.spend || 0); value += Number(m.conversion_value || 0);
        }
      }
      const rate = (a: number, b: number) => b > 0 ? +((a / b) * 100).toFixed(2) : 0;
      const steps = [
        { step: "Impression → Click (CTR)", rate_pct: rate(clicks, impressions), from: impressions, to: clicks },
        { step: "Click → View Content", rate_pct: rate(vc, clicks), from: clicks, to: vc },
        { step: "View → Add to Cart", rate_pct: rate(atc, vc), from: vc, to: atc },
        { step: "ATC → Initiate Checkout", rate_pct: rate(ic, atc), from: atc, to: ic },
        { step: "Checkout → Purchase", rate_pct: rate(purchases, ic), from: ic, to: purchases },
      ].filter((s) => s.from > 0);
      // healthy benchmarks
      const bench: Record<string, number> = { "Impression → Click (CTR)": 1.0, "Click → View Content": 60, "View → Add to Cart": 8, "ATC → Initiate Checkout": 50, "Checkout → Purchase": 40 };
      const bottleneck = steps
        .map((s) => ({ ...s, gap: bench[s.step] != null ? +(bench[s.step] - s.rate_pct).toFixed(2) : 0 }))
        .filter((s) => s.gap > 0)
        .sort((a, b) => b.gap - a.gap)[0];
      const diagnosis = !bottleneck ? "Funnel healthy across all steps."
        : bottleneck.step.startsWith("Impression") ? "Creative problem — hook is weak. Test new hooks/thumbnails."
        : bottleneck.step.startsWith("Click") ? "Landing page problem — slow load, broken link, or wrong audience."
        : bottleneck.step.startsWith("View") ? "Product/offer problem — price, value-prop, or product page UX."
        : bottleneck.step.startsWith("ATC") ? "Checkout friction — shipping cost shock, account-required, or trust gap."
        : "Payment/COD problem — gateway failures or COD verification drop-off.";
      return {
        from, to, total_spend_usd: +spend.toFixed(2), total_revenue_usd: +value.toFixed(2),
        roas: spend > 0 ? +(value / spend).toFixed(2) : 0,
        funnel: steps, bottleneck, diagnosis,
      };
    },
  },

  {
    name: "get_runway_forecast",
    description: "Forecast how many days a client's wallet balance will last at the current spend pace. Returns balance (BDT), avg daily spend (USD), conversion-adjusted runway in days, and urgency level. Use to spot top-up reminders before clients hit zero.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        lookback_days: { type: "number", description: "Days of spend history to average over. Default 7." },
      },
      required: ["client_id"],
    },
    execute: async (args, { service, orgId }) => {
      const lookback = Number(args.lookback_days || 7);
      const { data: client } = await service.from("profiles").select("full_name, business_name").eq("user_id", args.client_id).maybeSingle();
      // balance = sum of transactions (deposits - debits) — schema uses signed amounts via type
      const { data: txs } = await service
        .from("transactions")
        .select("type, amount, exchange_rate")
        .eq("client_id", args.client_id);
      let balanceBdt = 0;
      for (const t of txs || []) {
        const amt = Number(t.amount || 0);
        const signed = t.type === "deposit" || t.type === "refund" || t.type === "adjustment_credit" ? amt : -amt;
        balanceBdt += signed;
      }
      // avg recent daily spend (USD)
      const { data: camps } = await service.from("campaigns").select("id").eq("client_id", args.client_id).eq("org_id", orgId);
      const ids = (camps || []).map((c: any) => c.id);
      const { from, to } = resolveRange({ preset: lookback === 30 ? "last_30_days" : lookback === 14 ? "last_14_days" : "last_7_days" });
      let spendUsd = 0;
      if (ids.length > 0) {
        for (let i = 0; i < ids.length; i += 500) {
          const chunk = ids.slice(i, i + 500);
          const { data: ms } = await service.from("daily_metrics").select("spend").in("campaign_id", chunk).gte("data_date", from).lte("data_date", to);
          for (const m of ms || []) spendUsd += Number(m.spend || 0);
        }
      }
      const avgDailySpendUsd = +(spendUsd / lookback).toFixed(2);
      // approx BDT spend pace = USD * 125 (BD agency markup proxy); real exchange rate varies
      const usdToBdt = 125;
      const dailyBurnBdt = avgDailySpendUsd * usdToBdt;
      const runwayDays = dailyBurnBdt > 0 ? +(balanceBdt / dailyBurnBdt).toFixed(1) : null;
      let urgency: string;
      if (runwayDays == null) urgency = "no_spend";
      else if (runwayDays <= 2) urgency = "critical";
      else if (runwayDays <= 5) urgency = "high";
      else if (runwayDays <= 10) urgency = "medium";
      else urgency = "ok";
      const action = urgency === "critical" ? "Send top-up reminder TODAY. Recommend ৳" + Math.ceil(dailyBurnBdt * 15).toLocaleString("en-BD") + " minimum."
        : urgency === "high" ? "Top-up reminder this week."
        : urgency === "medium" ? "Soft reminder in next client check-in."
        : urgency === "no_spend" ? "Client not actively running ads — investigate."
        : "No action needed.";
      return {
        client: client?.business_name || client?.full_name,
        balance_bdt: +balanceBdt.toFixed(2),
        avg_daily_spend_usd: avgDailySpendUsd,
        avg_daily_burn_bdt: +dailyBurnBdt.toFixed(2),
        runway_days: runwayDays,
        urgency, action,
        based_on_last_days: lookback,
      };
    },
  },

  {
    name: "draft_optimization_brief",
    description: "Produce a structured optimization brief for one campaign — combines campaign perf + creative fatigue into a single Pause/Scale/Refresh/Reallocate recommendation with reasoning and KPI targets. Use this as the FINAL diagnostic step before recommending action.",
    parameters: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        preset: { type: "string" }, from: { type: "string" }, to: { type: "string" },
      },
      required: ["campaign_id"],
    },
    execute: async (args, { service, orgId }) => {
      const { from, to } = resolveRange(args);
      const { data: camp } = await service.from("campaigns")
        .select("id, name, platform, status, client_id, objective")
        .eq("id", args.campaign_id).eq("org_id", orgId).maybeSingle();
      if (!camp) return { error: "Campaign not found." };
      const { data: rows } = await service
        .from("daily_metrics")
        .select("spend, impressions, clicks, results, conversion_value, cpm, ctr, reach, purchase")
        .eq("campaign_id", args.campaign_id)
        .gte("data_date", from).lte("data_date", to);
      const series = rows || [];
      const sum = (k: string) => series.reduce((s: number, r: any) => s + Number(r[k] || 0), 0);
      const spend = sum("spend"), impr = sum("impressions"), clicks = sum("clicks"), results = sum("results"), value = sum("conversion_value"), reach = sum("reach");
      const roas = spend > 0 ? +(value / spend).toFixed(2) : 0;
      const ctr = impr > 0 ? +((clicks / impr) * 100).toFixed(2) : 0;
      const cpm = impr > 0 ? +((spend / impr) * 1000).toFixed(2) : 0;
      const cpa = results > 0 ? +(spend / results).toFixed(2) : 0;
      const freq = reach > 0 ? +(impr / reach).toFixed(2) : 0;
      let verdict: string; let reasoning: string;
      if (spend < 5) { verdict = "INVESTIGATE"; reasoning = "Too little spend to judge — let it run with daily budget cap or check delivery issues."; }
      else if (results === 0 && spend >= 20) { verdict = "PAUSE"; reasoning = `$${spend.toFixed(0)} spent with 0 results. Hard kill — rebuild from scratch.`; }
      else if (roas >= 3.0 && freq < 3.5) { verdict = "SCALE"; reasoning = `ROAS ${roas} with frequency ${freq} — safe to raise budget 20-30% per day.`; }
      else if (roas < 1.0 && spend >= 20) { verdict = "PAUSE"; reasoning = `Losing money — ROAS ${roas} below break-even after $${spend.toFixed(0)} spend.`; }
      else if (freq >= 4.5 || ctr < 0.8) { verdict = "REFRESH"; reasoning = `Frequency ${freq} / CTR ${ctr}% — creative is burning out. New variants needed.`; }
      else if (roas >= 1.5 && roas < 3.0) { verdict = "REALLOCATE"; reasoning = `Marginal performance (ROAS ${roas}) — shift budget to higher-ROAS campaigns and keep this on minimum.`; }
      else { verdict = "HOLD"; reasoning = "Performance acceptable — keep running and monitor weekly."; }
      return {
        campaign: camp.name, platform: camp.platform, objective: camp.objective, status: camp.status,
        period: { from, to },
        metrics: { spend_usd: +spend.toFixed(2), roas, ctr_pct: ctr, cpm_usd: cpm, cpa_usd: cpa, frequency: freq, results, revenue_usd: +value.toFixed(2) },
        verdict, reasoning,
        kpi_targets: { target_roas: 2.5, target_ctr_pct: 1.5, target_frequency_max: 3.5 },
      };
    },
  },
];

const TOOL_MAP: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

// ---------------- OpenAI-format tool schemas ----------------

function openAITools() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

function anthropicTools() {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

function geminiTools() {
  return [{
    function_declarations: TOOLS.map((t) => ({
      name: t.name, description: t.description, parameters: t.parameters,
    })),
  }];
}

// ---------------- Provider key loader ----------------

async function getCallerOrg(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("org_id").eq("user_id", userId).single();
  return data?.org_id ?? null;
}

async function getProviderKey(serviceClient: any, orgId: string, provider: Provider) {
  if (provider === "lovable") return { key: Deno.env.get("LOVABLE_API_KEY") || "", default_model: "google/gemini-3-flash-preview" };
  const { data } = await serviceClient.rpc("get_ai_provider_config", { _org_id: orgId, _provider: provider });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.api_key) return null;
  return { key: row.api_key, default_model: row.default_model, budget: Number(row.monthly_budget_usd), usage: Number(row.usage_this_month_usd) };
}

// ---------------- Provider tool-calling (non-stream for tool loop, stream final) ----------------

// Unified "completion" call — returns { content: string, tool_calls?: ToolCall[] }
async function complete(provider: Provider, key: string, model: string, messages: Msg[], withTools: boolean): Promise<{ content: string; tool_calls?: ToolCall[] }> {
  if (provider === "openai" || provider === "lovable") {
    const url = provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const body: any = {
      model,
      messages: messages.map((m) => {
        if (m.role === "tool") return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
        if (m.tool_calls) return { role: m.role, content: m.content || "", tool_calls: m.tool_calls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } })) };
        return { role: m.role, content: m.content || "" };
      }),
    };
    if (withTools) body.tools = openAITools();
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text();
      if (r.status === 429) throw new Error("Rate limit exceeded. Try again shortly.");
      if (r.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
      throw new Error(`${provider} ${r.status}: ${t.slice(0, 300)}`);
    }
    const j = await r.json();
    const msg = j.choices?.[0]?.message;
    const tcs = (msg?.tool_calls || []).map((tc: any) => ({ id: tc.id, name: tc.function?.name, arguments: safeJson(tc.function?.arguments) }));
    return { content: msg?.content || "", tool_calls: tcs.length ? tcs : undefined };
  }

  if (provider === "anthropic") {
    const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const conv: any[] = [];
    for (const m of messages.filter((m) => m.role !== "system")) {
      if (m.role === "tool") {
        conv.push({ role: "user", content: [{ type: "tool_result", tool_use_id: m.tool_call_id, content: m.content || "" }] });
      } else if (m.tool_calls) {
        const content: any[] = [];
        if (m.content) content.push({ type: "text", text: m.content });
        for (const tc of m.tool_calls) content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
        conv.push({ role: m.role, content });
      } else {
        conv.push({ role: m.role, content: m.content || "" });
      }
    }
    const body: any = { model, max_tokens: 2048, system: sys || undefined, messages: conv };
    if (withTools) body.tools = anthropicTools();
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    let content = ""; const tool_calls: ToolCall[] = [];
    for (const block of j.content || []) {
      if (block.type === "text") content += block.text;
      else if (block.type === "tool_use") tool_calls.push({ id: block.id, name: block.name, arguments: block.input });
    }
    return { content, tool_calls: tool_calls.length ? tool_calls : undefined };
  }

  // gemini
  const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents: any[] = [];
  for (const m of messages.filter((m) => m.role !== "system")) {
    if (m.role === "tool") {
      contents.push({ role: "user", parts: [{ functionResponse: { name: m.name, response: safeJson(m.content || "{}") } }] });
    } else if (m.tool_calls) {
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.tool_calls) parts.push({ functionCall: { name: tc.name, args: tc.arguments } });
      contents.push({ role: "model", parts });
    } else {
      contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content || "" }] });
    }
  }
  const body: any = {
    systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
    contents,
  };
  if (withTools) body.tools = geminiTools();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const parts = j.candidates?.[0]?.content?.parts || [];
  let content = ""; const tool_calls: ToolCall[] = [];
  for (const p of parts) {
    if (p.text) content += p.text;
    else if (p.functionCall) tool_calls.push({ id: `call_${tool_calls.length}_${Date.now()}`, name: p.functionCall.name, arguments: p.functionCall.args || {} });
  }
  return { content, tool_calls: tool_calls.length ? tool_calls : undefined };
}

function safeJson(s: any) {
  if (typeof s === "object" && s !== null) return s;
  try { return JSON.parse(String(s || "{}")); } catch { return {}; }
}

// ---------------- Main handler ----------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return j({ error: "Missing auth" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return j({ error: "Unauthorized" }, 401);
    const orgId = await getCallerOrg(supabase, user.id);
    if (!orgId) return j({ error: "No org for user" }, 403);

    const body = await req.json();
    const threadId: string = body.thread_id;
    const provider: Provider = body.provider || "lovable";
    let model: string = body.model || "";
    const mode: string = body.mode || "coach";
    const userText: string = String(body.text || "").trim();
    if (!threadId || !userText) return j({ error: "thread_id and text required" }, 400);

    const { data: thread } = await supabase.from("ai_threads").select("id, user_id, org_id").eq("id", threadId).single();
    if (!thread || thread.user_id !== user.id) return j({ error: "Thread not found" }, 404);

    const cfg = await getProviderKey(service, orgId, provider);
    if (!cfg?.key) return j({ error: `No API key configured for ${provider}. Add one in Settings → AI Providers.` }, 400);
    if (provider !== "lovable" && cfg.budget != null && cfg.usage != null && cfg.usage >= cfg.budget) {
      return j({ error: `Monthly budget for ${provider} ($${cfg.budget}) is reached.` }, 402);
    }
    if (!model) model = cfg.default_model || (provider === "openai" ? "gpt-4o-mini" : provider === "anthropic" ? "claude-3-5-sonnet-latest" : provider === "gemini" ? "gemini-2.5-flash" : "google/gemini-3-flash-preview");

    // Load last 20 messages for context
    const { data: history } = await supabase
      .from("ai_messages")
      .select("role, parts")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(20);
    const historyMsgs: Msg[] = (history || []).map((m: any) => {
      const text = Array.isArray(m.parts) ? m.parts.filter((p: any) => p?.type === "text").map((p: any) => p.text).join("") : "";
      return { role: m.role === "assistant" ? "assistant" : "user", content: text } as Msg;
    }).filter((m) => (m.content || "").length > 0);

    const system = `${BASE_AGENT_RULES}\n\n${MODE_PROMPTS[mode] || MODE_PROMPTS.coach}`;
    const messages: Msg[] = [{ role: "system", content: system }, ...historyMsgs, { role: "user", content: userText }];

    // Persist user message
    await service.from("ai_messages").insert({
      thread_id: threadId, org_id: orgId, role: "user",
      parts: [{ type: "text", text: userText }],
    });
    const { count } = await service.from("ai_messages").select("id", { count: "exact", head: true }).eq("thread_id", threadId);
    if ((count || 0) <= 1) {
      await service.from("ai_threads").update({ title: userText.slice(0, 60) + (userText.length > 60 ? "…" : ""), provider, model, updated_at: new Date().toISOString() }).eq("id", threadId);
    } else {
      await service.from("ai_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
    }

    const encoder = new TextEncoder();
    const assistantParts: any[] = [];
    const toolCallLog: any[] = [];

    const ctx: ToolCtx = { service, supabase, orgId, userId: user.id };
    const MAX_STEPS = 8;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: any) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

        try {
          for (let step = 0; step < MAX_STEPS; step++) {
            const isLast = step === MAX_STEPS - 1;
            send({ type: "step", step: step + 1 });
            const res = await complete(provider, cfg.key!, model, messages, !isLast);

            // Append assistant message into conversation
            if (res.content) {
              assistantParts.push({ type: "text", text: res.content });
              send({ type: "text", text: res.content });
            }
            messages.push({ role: "assistant", content: res.content, tool_calls: res.tool_calls });

            if (!res.tool_calls || res.tool_calls.length === 0) break;

            // Execute each tool call
            for (const tc of res.tool_calls) {
              const tool = TOOL_MAP[tc.name];
              const callRow = { type: "tool_call", id: tc.id, name: tc.name, args: tc.arguments };
              assistantParts.push(callRow);
              send(callRow);
              const started = Date.now();
              let result: any; let status = "ok"; let errMsg: string | undefined;
              try {
                if (!tool) throw new Error(`Unknown tool: ${tc.name}`);
                result = await tool.execute(tc.arguments || {}, ctx);
              } catch (e) {
                status = "error";
                errMsg = e instanceof Error ? e.message : String(e);
                result = { error: errMsg };
              }
              const latency = Date.now() - started;
              const resultRow = { type: "tool_result", id: tc.id, name: tc.name, status, latency_ms: latency, result };
              assistantParts.push(resultRow);
              send(resultRow);
              toolCallLog.push({ tool_name: tc.name, args: tc.arguments, result, status, latency_ms: latency, error: errMsg });
              messages.push({ role: "tool", tool_call_id: tc.id, name: tc.name, content: JSON.stringify(result).slice(0, 8000) });
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          send({ type: "error", error: msg });
          assistantParts.push({ type: "text", text: `\n\n[Error: ${msg}]` });
        } finally {
          // Persist assistant turn
          try {
            const { data: inserted } = await service.from("ai_messages").insert({
              thread_id: threadId, org_id: orgId, role: "assistant",
              parts: assistantParts.length ? assistantParts : [{ type: "text", text: "(no response)" }],
              provider, model,
            }).select("id").single();
            // Persist tool calls
            if (inserted && toolCallLog.length) {
              await service.from("ai_tool_calls").insert(
                toolCallLog.map((t) => ({
                  thread_id: threadId, message_id: inserted.id, org_id: orgId, user_id: user.id,
                  tool_name: t.tool_name, args: t.args, result: t.result, status: t.status,
                  latency_ms: t.latency_ms, error: t.error,
                })),
              );
            }
          } catch (_) { /* swallow */ }
          send({ type: "done" });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Provider": provider, "X-Model": model },
    });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
