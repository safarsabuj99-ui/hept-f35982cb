// AI Campaign Agent — multi-stage reasoning pipeline.
// POST { draft_id } — kicks off the staged loop and returns immediately.
// Stages: scrape → learn → strategize → draft → critique. Status is streamed
// into ai_campaign_drafts.agent_stage / agent_log so the UI can poll.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

// deno-lint-ignore no-explicit-any
type Any = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return j({ error: "Missing auth" }, 401);
    if (!LOVABLE_API_KEY) return j({ error: "LOVABLE_API_KEY not configured" }, 500);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return j({ error: "Unauthorized" }, 401);

    const { draft_id } = await req.json();
    if (!draft_id) return j({ error: "draft_id required" }, 400);

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: draft } = await service.from("ai_campaign_drafts").select("*").eq("id", draft_id).maybeSingle();
    if (!draft) return j({ error: "Draft not found" }, 404);

    // Reset stage state and run pipeline in background.
    await service.from("ai_campaign_drafts").update({
      status: "researching",
      agent_stage: "scraping",
      agent_log: [],
      error: null,
    }).eq("id", draft_id);

    const work = runPipeline(service, draft_id, user.id).catch(async (e) => {
      console.error("[ai-campaign-agent] pipeline error", e);
      await service.from("ai_campaign_drafts").update({
        status: "failed",
        agent_stage: "failed",
        error: e instanceof Error ? e.message : String(e),
      }).eq("id", draft_id);
    });
    // @ts-ignore EdgeRuntime is provided by Supabase deno deploy
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work);
    else await work;

    return j({ ok: true, draft_id });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ───────────────────────── pipeline ─────────────────────────

async function runPipeline(service: Any, draftId: string, userId: string) {
  const { data: draft } = await service.from("ai_campaign_drafts").select("*").eq("id", draftId).maybeSingle();
  if (!draft) throw new Error("Draft missing");

  const [{ data: client }, { data: account }, { data: mapping }] = await Promise.all([
    service.from("profiles").select("id, user_id, full_name, business_name, country, language").eq("user_id", draft.client_id).maybeSingle(),
    service.from("ad_accounts").select("id, platform_name, account_currency, account_name").eq("id", draft.ad_account_id).maybeSingle(),
    service.from("ad_account_clients").select("mapping_keyword").eq("ad_account_id", draft.ad_account_id).eq("client_id", draft.client_id).maybeSingle(),
  ]);

  const platform = (account?.platform_name || draft.platform || "meta").toLowerCase();
  const currency = account?.account_currency || "USD";
  const keyword = (mapping?.mapping_keyword || client?.business_name || "client").trim();
  const productName = (draft.product_name || "product").trim();
  const objective = (draft.objective || "SALES").toUpperCase();

  // ───── stage 1: scrape ─────
  let scraped: Any = null;
  await setStage(service, draftId, "scraping");
  if (draft.product_url && FIRECRAWL_API_KEY) {
    try {
      scraped = await firecrawlScrape(draft.product_url);
      await appendLog(service, draftId, "scraping", "Scraped product URL.", scraped ? { title: scraped?.metadata?.title } : {});
    } catch (e) {
      await appendLog(service, draftId, "scraping", `Skipped scraping: ${(e as Error).message.slice(0, 120)}`);
    }
  } else {
    await appendLog(service, draftId, "scraping", draft.product_url ? "Firecrawl not connected — skipped URL deep-scrape." : "No product URL — skipped scraping.");
  }

  // ───── stage 2: learn from past performance ─────
  await setStage(service, draftId, "learning");
  const past = await loadPastPerformance(service, draft.client_id, draft.ad_account_id, objective);
  await service.from("ai_campaign_drafts").update({ past_performance_json: past }).eq("id", draftId);
  await appendLog(service, draftId, "learning",
    past.total_campaigns > 0
      ? `Analyzed ${past.total_campaigns} past campaigns · avg CPA ${past.avg_cpa?.toFixed?.(2) ?? "n/a"} ${currency}`
      : "No past campaigns for this client yet — using best-practice defaults.");

  // ───── stage 3: strategize ─────
  await setStage(service, draftId, "strategizing");
  const strategy = await llmStrategy({
    platform, currency, keyword, productName, objective,
    productBrief: draft.product_brief, productUrl: draft.product_url,
    scraped, past, client,
  });
  await service.from("ai_campaign_drafts").update({ strategy_json: strategy }).eq("id", draftId);
  await appendLog(service, draftId, "strategizing", `Strategy ready · ${strategy.angles?.length ?? 0} angles · budget ${strategy.recommended_budget?.daily ?? "?"} ${currency}/day`);

  // ───── stage 4: draft ─────
  await setStage(service, draftId, "drafting");
  const tree = await llmDraft({
    platform, currency, keyword, productName, objective,
    productBrief: draft.product_brief, productUrl: draft.product_url,
    scraped, past, strategy, client,
  });
  normalizeTreeNames(tree, { keyword, productName, objective });
  if (strategy.recommended_budget?.daily && tree.campaign && !tree.campaign.daily_budget) {
    tree.campaign.daily_budget = strategy.recommended_budget.daily;
  }
  if (strategy.recommended_budget) tree.budget_plan = strategy.recommended_budget;
  await appendLog(service, draftId, "drafting", `Built ${tree.ad_sets?.length ?? tree.ad_groups?.length ?? 0} group(s) for ${platform.toUpperCase()}.`);

  // ───── stage 5: critique & refine ─────
  await setStage(service, draftId, "critiquing");
  let critique: Any = null;
  try {
    critique = await llmCritique({ platform, productName, objective, past, draft: tree });
    if (critique?.revised_tree?.campaign) {
      normalizeTreeNames(critique.revised_tree, { keyword, productName, objective });
      if (tree.budget_plan && !critique.revised_tree.budget_plan) critique.revised_tree.budget_plan = tree.budget_plan;
      // Persist critique notes alongside the strategy_json so the UI can show them.
      await service.from("ai_campaign_drafts").update({
        strategy_json: { ...strategy, critique: { issues_found: critique.issues_found ?? [], summary: critique.summary ?? "" } },
      }).eq("id", draftId);
    }
  } catch (e) {
    await appendLog(service, draftId, "critiquing", `Self-review skipped: ${(e as Error).message.slice(0, 120)}`);
  }

  const finalTree = critique?.revised_tree?.campaign ? critique.revised_tree : tree;
  if (critique?.issues_found?.length) {
    await appendLog(service, draftId, "critiquing", `Self-review fixed ${critique.issues_found.length} issue(s).`);
  } else {
    await appendLog(service, draftId, "critiquing", "Self-review found no major issues.");
  }

  const nextVersion = (draft.version || 1);
  await service.from("ai_campaign_drafts").update({
    draft_json: finalTree,
    status: "ready",
    agent_stage: "ready",
    version: nextVersion,
  }).eq("id", draftId);
  await service.from("ai_campaign_draft_versions").insert({
    draft_id: draftId,
    org_id: draft.org_id,
    version: nextVersion,
    draft_json: finalTree,
    edited_by: userId,
    change_note: "AI agent (5-stage)",
  });
}

// ───────────────────────── stage helpers ─────────────────────────

async function setStage(service: Any, draftId: string, stage: string) {
  await service.from("ai_campaign_drafts").update({ agent_stage: stage }).eq("id", draftId);
}

async function appendLog(service: Any, draftId: string, stage: string, summary: string, extra: Any = {}) {
  const { data } = await service.from("ai_campaign_drafts").select("agent_log").eq("id", draftId).maybeSingle();
  const log = Array.isArray(data?.agent_log) ? data.agent_log : [];
  log.push({ stage, summary, at: new Date().toISOString(), ...extra });
  await service.from("ai_campaign_drafts").update({ agent_log: log }).eq("id", draftId);
}

// ───────────────────────── Firecrawl ─────────────────────────

async function firecrawlScrape(url: string) {
  const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["markdown", "summary"],
      onlyMainContent: true,
    }),
  });
  if (!resp.ok) throw new Error(`Firecrawl ${resp.status}`);
  const data = await resp.json();
  return data?.data ?? data;
}

// ───────────────────────── past performance ─────────────────────────

async function loadPastPerformance(service: Any, clientId: string, adAccountId: string, objective: string) {
  // Pull last 90d of perf rows joined to campaigns for this client.
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data: campaigns } = await service
    .from("campaigns")
    .select("id, platform_id, name, objective, status")
    .eq("client_id", clientId)
    .limit(500);
  const ids = (campaigns ?? []).map((c: Any) => c.platform_id).filter(Boolean);
  if (ids.length === 0) {
    return { total_campaigns: 0, top_angles: [], top_audiences: [], avg_cpa: null, avg_roas: null, best_objective: null };
  }
  const { data: perf } = await service
    .from("campaign_performance")
    .select("campaign_id, spend, results, conversion_value, ctr")
    .in("campaign_id", ids)
    .eq("client_id", clientId)
    .gte("date", since);

  const byCamp = new Map<string, { spend: number; results: number; value: number }>();
  for (const p of perf ?? []) {
    const k = p.campaign_id;
    const acc = byCamp.get(k) ?? { spend: 0, results: 0, value: 0 };
    acc.spend += Number(p.spend) || 0;
    acc.results += Number(p.results) || 0;
    acc.value += Number(p.conversion_value) || 0;
    byCamp.set(k, acc);
  }

  let totalSpend = 0, totalResults = 0, totalValue = 0, sameObjCount = 0;
  const ranked = (campaigns ?? []).map((c: Any) => {
    const m = byCamp.get(c.platform_id) ?? { spend: 0, results: 0, value: 0 };
    totalSpend += m.spend; totalResults += m.results; totalValue += m.value;
    if ((c.objective || "").toUpperCase() === objective) sameObjCount++;
    const cpa = m.results > 0 ? m.spend / m.results : null;
    const roas = m.spend > 0 ? m.value / m.spend : null;
    return { name: c.name, objective: c.objective, spend: m.spend, results: m.results, cpa, roas };
  })
  .filter((r: Any) => r.spend > 0)
  .sort((a: Any, b: Any) => (b.roas ?? 0) - (a.roas ?? 0));

  const top_angles = ranked.slice(0, 5).map((r: Any) => ({
    name: r.name, spend: round(r.spend), cpa: r.cpa ? round(r.cpa) : null, roas: r.roas ? round(r.roas, 2) : null,
  }));

  return {
    total_campaigns: ranked.length,
    same_objective_campaigns: sameObjCount,
    total_spend: round(totalSpend),
    avg_cpa: totalResults > 0 ? round(totalSpend / totalResults) : null,
    avg_roas: totalSpend > 0 ? round(totalValue / totalSpend, 2) : null,
    top_angles,
  };
}

function round(n: number, d = 2) { const f = 10 ** d; return Math.round(n * f) / f; }

// ───────────────────────── LLM: Strategy ─────────────────────────

const STRATEGY_TOOL = {
  type: "function",
  function: {
    name: "submit_strategy",
    description: "Submit a concrete strategy brief that will guide campaign drafting.",
    parameters: {
      type: "object",
      properties: {
        product_summary: { type: "string" },
        usp: { type: "string" },
        target_personas: {
          type: "array", minItems: 1, maxItems: 3,
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              age_range: { type: "string" },
              gender: { type: "string", enum: ["all", "male", "female"] },
              interests: { type: "array", items: { type: "string" } },
              pain_points: { type: "array", items: { type: "string" } },
            },
            required: ["label", "age_range", "gender", "interests"],
          },
        },
        angles: {
          type: "array", minItems: 2, maxItems: 5,
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              short_hook: { type: "string" },
              reasoning: { type: "string" },
            },
            required: ["name", "short_hook"],
          },
        },
        recommended_budget: {
          type: "object",
          properties: {
            daily: { type: "number" },
            total_cap: { type: "number" },
            bid_strategy: { type: "string" },
            scaling_rule: { type: "string" },
            justification: { type: "string" },
          },
          required: ["daily", "bid_strategy", "justification"],
        },
        platform_notes: { type: "string", description: "Why this platform / format fits." },
      },
      required: ["product_summary", "target_personas", "angles", "recommended_budget"],
    },
  },
};

async function llmStrategy(ctx: Any) {
  const sys = `You are an elite performance marketing STRATEGIST. Produce a sharp strategy brief grounded in (1) the product, (2) the client's past performance, (3) the platform.
Be opinionated. Pick angles likely to win. Recommend a sensible daily budget in ${ctx.currency}. If past CPA is known, derive budget to get ≥30 conversions in 7 days (≈ avg_cpa × 30 / 7). Never invent metrics. Return ONLY via submit_strategy.`;

  const user = `PLATFORM: ${ctx.platform.toUpperCase()}
OBJECTIVE: ${ctx.objective}
CLIENT: ${ctx.client?.business_name ?? ctx.client?.full_name ?? "Unknown"} (country: ${ctx.client?.country ?? "BD"}, language: ${ctx.client?.language ?? "en"})
PRODUCT: ${ctx.productName}

PRODUCT BRIEF:
${ctx.productBrief}

URL: ${ctx.productUrl ?? "(none)"}
${ctx.scraped?.markdown ? `\nSCRAPED PRODUCT PAGE (truncated):\n${String(ctx.scraped.markdown).slice(0, 3500)}\n` : ""}
${ctx.scraped?.summary ? `\nSCRAPED SUMMARY: ${ctx.scraped.summary}\n` : ""}

PAST PERFORMANCE (last 90d):
${JSON.stringify(ctx.past, null, 2)}

Produce the strategy now.`;

  return await callTool("google/gemini-2.5-pro", sys, user, STRATEGY_TOOL);
}

// ───────────────────────── LLM: Draft (platform-aware) ─────────────────────────

function metaTool() {
  return {
    type: "function",
    function: {
      name: "submit_campaign",
      description: "Return a complete Meta campaign tree.",
      parameters: {
        type: "object",
        properties: {
          campaign: {
            type: "object",
            properties: {
              name: { type: "string" },
              objective: { type: "string" },
              daily_budget: { type: "number" },
              buying_type: { type: "string", enum: ["AUCTION", "RESERVED"] },
            },
            required: ["name", "objective", "daily_budget"],
          },
          ad_sets: {
            type: "array", minItems: 1, maxItems: 3,
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                audience: {
                  type: "object",
                  properties: {
                    countries: { type: "array", items: { type: "string" } },
                    age_min: { type: "number" }, age_max: { type: "number" },
                    gender: { type: "string", enum: ["all", "male", "female"] },
                    interests: { type: "array", items: { type: "string" } },
                  },
                  required: ["countries", "age_min", "age_max", "gender", "interests"],
                },
                placements: { type: "string", enum: ["automatic", "feeds_only", "stories_reels", "manual"] },
                optimization_goal: { type: "string" },
                ads: {
                  type: "array", minItems: 1, maxItems: 4,
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      format: { type: "string", enum: ["single_image", "single_video", "carousel", "collection"] },
                      primary_texts: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
                      headlines: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
                      description: { type: "string" },
                      cta: { type: "string" },
                      destination_url: { type: "string" },
                      creative_brief: { type: "string" },
                      angle_used: { type: "string" },
                    },
                    required: ["name", "format", "primary_texts", "headlines", "cta", "destination_url", "creative_brief", "angle_used"],
                  },
                },
              },
              required: ["name", "audience", "placements", "ads"],
            },
          },
          rationale: { type: "string" },
        },
        required: ["campaign", "ad_sets", "rationale"],
      },
    },
  };
}

function tiktokTool() {
  return {
    type: "function",
    function: {
      name: "submit_campaign",
      description: "Return a complete TikTok campaign tree.",
      parameters: {
        type: "object",
        properties: {
          campaign: {
            type: "object",
            properties: {
              name: { type: "string" },
              objective: { type: "string" },
              daily_budget: { type: "number" },
            },
            required: ["name", "objective", "daily_budget"],
          },
          ad_groups: {
            type: "array", minItems: 1, maxItems: 3,
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                audience: {
                  type: "object",
                  properties: {
                    countries: { type: "array", items: { type: "string" } },
                    age_min: { type: "number" }, age_max: { type: "number" },
                    gender: { type: "string", enum: ["all", "male", "female"] },
                    interest_categories: { type: "array", items: { type: "string" } },
                    behaviors: { type: "array", items: { type: "string" } },
                  },
                  required: ["countries", "age_min", "age_max", "gender", "interest_categories"],
                },
                placements: { type: "string", enum: ["tiktok_only", "automatic"] },
                optimization_goal: { type: "string" },
                ads: {
                  type: "array", minItems: 1, maxItems: 4,
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      format: { type: "string", enum: ["single_video", "spark_ad", "carousel"] },
                      hook: { type: "string", description: "First 3-second scroll-stopping hook line." },
                      script: { type: "string", description: "Full 15-30s creator script." },
                      caption: { type: "string" },
                      cta: { type: "string" },
                      destination_url: { type: "string" },
                      creator_persona: { type: "string" },
                      visual_brief: { type: "string" },
                      angle_used: { type: "string" },
                    },
                    required: ["name", "format", "hook", "script", "caption", "cta", "destination_url", "angle_used"],
                  },
                },
              },
              required: ["name", "audience", "placements", "ads"],
            },
          },
          rationale: { type: "string" },
        },
        required: ["campaign", "ad_groups", "rationale"],
      },
    },
  };
}

function googleTool() {
  return {
    type: "function",
    function: {
      name: "submit_campaign",
      description: "Return a complete Google Ads campaign (Search or Performance Max).",
      parameters: {
        type: "object",
        properties: {
          campaign: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string", enum: ["SEARCH", "PERFORMANCE_MAX"] },
              objective: { type: "string" },
              daily_budget: { type: "number" },
              bidding_strategy: { type: "string" },
            },
            required: ["name", "type", "daily_budget"],
          },
          ad_groups: {
            type: "array", minItems: 1, maxItems: 3,
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                theme: { type: "string" },
                keywords: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string" },
                      match_type: { type: "string", enum: ["EXACT", "PHRASE", "BROAD"] },
                    },
                    required: ["text", "match_type"],
                  },
                },
                negative_keywords: { type: "array", items: { type: "string" } },
                ads: {
                  type: "array", minItems: 1, maxItems: 2,
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      headlines: { type: "array", items: { type: "string" }, minItems: 8, maxItems: 15 },
                      descriptions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
                      sitelinks: { type: "array", items: { type: "string" } },
                      final_url: { type: "string" },
                    },
                    required: ["name", "headlines", "descriptions", "final_url"],
                  },
                },
              },
              required: ["name", "theme", "ads"],
            },
          },
          asset_groups: {
            type: "array",
            description: "For PERFORMANCE_MAX campaigns only.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                headlines: { type: "array", items: { type: "string" } },
                long_headlines: { type: "array", items: { type: "string" } },
                descriptions: { type: "array", items: { type: "string" } },
                image_briefs: { type: "array", items: { type: "string" } },
                audience_signal: { type: "string" },
                final_url: { type: "string" },
              },
              required: ["name", "headlines", "descriptions", "final_url"],
            },
          },
          rationale: { type: "string" },
        },
        required: ["campaign", "rationale"],
      },
    },
  };
}

function platformTool(platform: string) {
  if (platform === "tiktok") return tiktokTool();
  if (platform === "google") return googleTool();
  return metaTool();
}

async function llmDraft(ctx: Any) {
  const datestamp = stamp();
  const platform = ctx.platform;
  let nameTemplate = "";
  let platformGuide = "";
  if (platform === "tiktok") {
    nameTemplate = `Campaign: "${ctx.keyword} | ${ctx.productName} | ${ctx.objective} | ${datestamp}"
Ad Group: "${ctx.keyword} | ${ctx.productName} | {AUDIENCE} | TT"
Ad: "${ctx.keyword} | ${ctx.productName} | {FORMAT} | v{N}"`;
    platformGuide = `TikTok rules:
- Hook MUST land in the first 3 seconds. Pattern interrupt, bold claim, or sharp question.
- Script: vertical 9:16, 15-30s, creator-led, native feel (NOT polished brand ads).
- Use Spark Ads format where authentic creator persona helps trust.
- Captions: short, with 2-3 niche hashtags.`;
  } else if (platform === "google") {
    nameTemplate = `Campaign: "${ctx.keyword} | ${ctx.productName} | ${ctx.objective} | ${datestamp}"
Ad Group: "${ctx.keyword} | ${ctx.productName} | {THEME}"`;
    platformGuide = `Google Ads rules:
- Pick SEARCH if intent is high and product URL is generic; pick PERFORMANCE_MAX if there's a strong landing page + creative assets.
- Search: 10-15 unique headlines (≤30 chars each) + 3-4 descriptions (≤90 chars). Include keyword in 2-3 headlines.
- PMax: 5+ short headlines, 5+ long headlines, 5+ descriptions, 5+ image briefs.
- Keywords mix EXACT + PHRASE; include 5+ smart negative keywords.
- Bidding: Maximize Conversions / Target CPA / Target ROAS based on objective.`;
  } else {
    nameTemplate = `Campaign: "${ctx.keyword} | ${ctx.productName} | ${ctx.objective} | ${datestamp}"
Ad Set:  "${ctx.keyword} | ${ctx.productName} | {AUDIENCE} | {PLACEMENT}"
Ad:      "${ctx.keyword} | ${ctx.productName} | {FORMAT} | v{N}"`;
    platformGuide = `Meta rules:
- Primary texts 80-150 chars, scroll-stopping hook first. Headlines ≤40 chars.
- Pick CTA matching objective. Add utm_source/medium/campaign on destination URLs.`;
  }

  const sys = `You are an elite ${platform.toUpperCase()} campaign ARCHITECT. Produce a launch-ready tree.

NAMING CONVENTION (USE EXACTLY):
${nameTemplate}

CAMPAIGN OBJECTIVE (LOCKED): campaign.objective MUST be "${ctx.objective}".
Currency: ${ctx.currency}. Daily budget should be: ${ctx.strategy?.recommended_budget?.daily ?? "sensible"} ${ctx.currency}/day (anchor on this).
${platformGuide}

GROUND IN THE STRATEGY BRIEF + PAST PERFORMANCE PROVIDED. Reuse winning angles if past data is rich.
All copy in ${ctx.client?.language ?? "en"}; culturally relevant for ${ctx.client?.country ?? "BD"}.
Return ONLY via submit_campaign.`;

  const user = `STRATEGY BRIEF:
${JSON.stringify(ctx.strategy, null, 2)}

PAST PERFORMANCE (last 90d):
${JSON.stringify(ctx.past, null, 2)}

PRODUCT BRIEF:
${ctx.productBrief}

URL: ${ctx.productUrl ?? "(none)"}
${ctx.scraped?.summary ? `\nPRODUCT PAGE SUMMARY: ${ctx.scraped.summary}\n` : ""}

Build the ${platform.toUpperCase()} campaign tree now.`;

  return await callTool("google/gemini-2.5-pro", sys, user, platformTool(platform));
}

// ───────────────────────── LLM: Critique ─────────────────────────

const CRITIQUE_TOOL = {
  type: "function",
  function: {
    name: "submit_critique_and_revision",
    description: "Critique the draft as a senior media buyer and return an improved revision.",
    parameters: {
      type: "object",
      properties: {
        issues_found: { type: "array", items: { type: "string" } },
        summary: { type: "string", description: "1-2 sentence summary of what changed and why." },
        revised_tree: { type: "object", description: "Improved campaign tree with the same shape as the original." },
      },
      required: ["issues_found", "summary", "revised_tree"],
    },
  },
};

async function llmCritique(ctx: Any) {
  const sys = `You are a senior media buyer auditing an AI-generated ${ctx.platform.toUpperCase()} campaign before launch.
Spot weaknesses (vague hooks, generic copy, wrong CTA, audience too broad/narrow, mis-priced budget vs past CPA, missing UTMs, weak first 3 seconds for video, weak keywords for Search).
Then return an IMPROVED revised_tree using the SAME shape and the same keys. Keep names canonical.
Be surgical, not destructive. Return ONLY via submit_critique_and_revision.`;
  const user = `PAST PERFORMANCE: ${JSON.stringify(ctx.past, null, 2)}

DRAFT TO REVIEW:
${JSON.stringify(ctx.draft, null, 2)}`;
  return await callTool("google/gemini-2.5-pro", sys, user, CRITIQUE_TOOL);
}

// ───────────────────────── LLM helper ─────────────────────────

async function callTool(model: string, system: string, user: string, tool: Any) {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      tools: [tool],
      tool_choice: { type: "function", function: { name: tool.function.name } },
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 429) throw new Error("Rate limit exceeded. Try again shortly.");
    if (resp.status === 402) throw new Error("AI credits exhausted.");
    throw new Error(`AI gateway error ${resp.status}: ${text.slice(0, 180)}`);
  }
  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("Model returned no structured tool call");
  try { return JSON.parse(call.function.arguments); } catch { throw new Error("Tool call arguments not valid JSON"); }
}

// ───────────────────────── shared utils ─────────────────────────

function stamp() {
  const t = new Date();
  return `${String(t.getFullYear()).slice(2)}${String(t.getMonth() + 1).padStart(2, "0")}${String(t.getDate()).padStart(2, "0")}`;
}

function normalizeTreeNames(tree: Any, { keyword, productName, objective }: Any) {
  if (!tree) return;
  const datestamp = stamp();
  if (tree.campaign) {
    tree.campaign.objective = tree.campaign.objective || objective;
    tree.campaign.name = `${keyword} | ${productName} | ${objective} | ${datestamp}`;
  }
  const prefix = `${keyword} | ${productName} | `;
  const groups = tree.ad_sets || tree.ad_groups || [];
  groups.forEach((g: Any, i: number) => {
    if (g && typeof g.name === "string" && !g.name.startsWith(prefix)) {
      const tail = g.name.split("|").slice(1).join("|").trim() || `set_${i + 1}`;
      g.name = `${prefix}${tail}`;
    }
    (g?.ads ?? []).forEach((ad: Any, j: number) => {
      if (ad && typeof ad.name === "string" && !ad.name.startsWith(prefix)) {
        const tail = ad.name.split("|").slice(1).join("|").trim() || `${ad.format || "ad"} | v${j + 1}`;
        ad.name = `${prefix}${tail}`;
      }
    });
  });
}

function j(body: Any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
