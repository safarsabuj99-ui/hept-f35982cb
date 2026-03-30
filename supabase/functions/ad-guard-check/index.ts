import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const START_TIME = Date.now();
const TIMEOUT_MS = 22_000;
const BATCH_SIZE = 5;
const MAX_ATTEMPTS = 10;

function timeLeft(): number {
  return TIMEOUT_MS - (Date.now() - START_TIME);
}

// ===== Platform pause helpers =====

async function pauseTikTokCampaign(
  advertiserId: string, rawCampaignId: string, token: string, tiktokBase: string
): Promise<{ success: boolean; message: string; localOnly?: boolean }> {
  try {
    const res = await fetch(`${tiktokBase}/open_api/v1.3/campaign/status/update/`, {
      method: "POST",
      headers: { "Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        advertiser_id: advertiserId,
        campaign_ids: [rawCampaignId],
        operation_status: "DISABLE",
      }),
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = { code: -1, message: text }; }
    if (json.code === 0) return { success: true, message: "OK" };
    if (json.code === 41000 || json.message?.includes("banned Country")) {
      return { success: true, message: "Geo-restricted, local-only", localOnly: true };
    }
    return { success: false, message: json.message || `TikTok error ${json.code}` };
  } catch (err: any) {
    return { success: false, message: err.message || "Network error" };
  }
}

async function pauseMetaCampaign(
  rawCampaignId: string, token: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${rawCampaignId}?access_token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ status: "PAUSED" }).toString(),
      }
    );
    const json = await res.json();
    if (json.success || res.ok) return { success: true, message: "OK" };
    return { success: false, message: json.error?.message || "Meta API error" };
  } catch (err: any) {
    return { success: false, message: err.message || "Network error" };
  }
}

async function pauseGoogleCampaign(
  customerId: string, rawCampaignId: string, token: string, devToken: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(
      `https://googleads.googleapis.com/v18/customers/${customerId}/campaigns:mutate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "developer-token": devToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operations: [{
            update: {
              resourceName: `customers/${customerId}/campaigns/${rawCampaignId}`,
              status: "PAUSED",
            },
            updateMask: "status",
          }],
        }),
      }
    );
    const json = await res.json();
    if (res.ok) return { success: true, message: "OK" };
    return { success: false, message: json.error?.message || "Google API error" };
  } catch (err: any) {
    return { success: false, message: err.message || "Network error" };
  }
}

// ===== Platform VERIFICATION helpers =====
// After pause API succeeds, read back the actual status to confirm

async function verifyTikTokPaused(
  advertiserId: string, rawCampaignId: string, token: string, tiktokBase: string
): Promise<{ verified: boolean; actualStatus: string | null; error?: string }> {
  try {
    const res = await fetch(
      `${tiktokBase}/open_api/v1.3/campaign/get/?advertiser_id=${advertiserId}&filtering={"campaign_ids":["${rawCampaignId}"]}&fields=["operation_status"]`,
      { headers: { "Access-Token": token } }
    );
    const json = await res.json();
    const status = json?.data?.list?.[0]?.operation_status;
    if (!status) return { verified: false, actualStatus: null, error: "Could not read status" };
    const isPaused = ["DISABLE", "CAMPAIGN_STATUS_DISABLE"].includes(status.toUpperCase());
    return { verified: isPaused, actualStatus: status };
  } catch (err: any) {
    return { verified: false, actualStatus: null, error: err.message };
  }
}

async function verifyMetaPaused(
  rawCampaignId: string, token: string
): Promise<{ verified: boolean; actualStatus: string | null; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${rawCampaignId}?fields=effective_status&access_token=${token}`
    );
    const json = await res.json();
    const status = json.effective_status;
    if (!status) return { verified: false, actualStatus: null, error: "Could not read status" };
    const isPaused = ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"].includes(status.toUpperCase());
    return { verified: isPaused, actualStatus: status };
  } catch (err: any) {
    return { verified: false, actualStatus: null, error: err.message };
  }
}

async function verifyGooglePaused(
  customerId: string, rawCampaignId: string, token: string, devToken: string
): Promise<{ verified: boolean; actualStatus: string | null; error?: string }> {
  try {
    const res = await fetch(
      `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "developer-token": devToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: `SELECT campaign.status FROM campaign WHERE campaign.id = ${rawCampaignId}` }),
      }
    );
    const json = await res.json();
    const status = json?.[0]?.results?.[0]?.campaign?.status;
    if (!status) return { verified: false, actualStatus: null, error: "Could not read status" };
    return { verified: status.toUpperCase() === "PAUSED", actualStatus: status };
  } catch (err: any) {
    return { verified: false, actualStatus: null, error: err.message };
  }
}

// ===== Main handler =====

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const sb = createClient(supabaseUrl, serviceRoleKey);

    // Auth: accept service role key, anon key (cron), or admin JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    if (token !== serviceRoleKey && token !== anonKey) {
      const { data: { user: caller }, error: authError } = await sb.auth.getUser(token);
      if (authError || !caller) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleCheck } = await sb
        .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").single();
      if (!roleCheck) {
        return new Response(JSON.stringify({ error: "Forbidden: Admin only" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get TikTok proxy URL
    const { data: proxySetting } = await sb
      .from("settings").select("value").eq("key", "tiktok_proxy_url").maybeSingle();
    const tiktokBase = proxySetting?.value?.replace(/\/+$/, "") || "https://business-api.tiktok.com";

    let totalConfirmed = 0;
    let totalFailed = 0;
    let totalNewlyQueued = 0;
    let timedOut = false;
    const results: any[] = [];

    // ===== PHASE 1: Process queued jobs (the AUTHORITATIVE retry worker) =====
    // This is the core fix: process all pending jobs from guard_pause_jobs
    const { data: pendingJobs } = await sb
      .from("guard_pause_jobs")
      .select("id, campaign_id, attempts, status")
      .eq("status", "pending")
      .lte("available_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(50);

    if (pendingJobs && pendingJobs.length > 0) {
      console.log(`Phase 1: ${pendingJobs.length} pending pause jobs to process`);

      // Fetch all campaign details for these jobs
      const campaignIds = pendingJobs.map(j => j.campaign_id);
      const { data: campaigns } = await sb
        .from("campaigns")
        .select("id, name, platform, platform_id, ad_account_id, client_id, status, pause_required")
        .in("id", campaignIds);

      if (campaigns && campaigns.length > 0) {
        // Pre-fetch ad accounts + integrations
        const adAccountIds = [...new Set(campaigns.map(c => c.ad_account_id))];
        const { data: adAccounts } = await sb
          .from("ad_accounts")
          .select("id, ad_account_id, platform_name, api_integration_id")
          .in("id", adAccountIds);

        const integrationIds = [...new Set((adAccounts || []).map(a => a.api_integration_id).filter(Boolean))];
        const { data: integrations } = await sb
          .from("api_integrations")
          .select("id, api_token, app_id, platform")
          .in("id", integrationIds as string[]);

        const intMap = new Map((integrations || []).map(i => [i.id, i]));
        const accMap = new Map((adAccounts || []).map(a => [a.id, a]));
        const campMap = new Map(campaigns.map(c => [c.id, c]));

        // Process in batches
        for (let i = 0; i < pendingJobs.length; i += BATCH_SIZE) {
          if (timeLeft() < 3000) {
            console.log(`⏱ Timeout approaching at job ${i}/${pendingJobs.length}`);
            timedOut = true;
            break;
          }

          const batch = pendingJobs.slice(i, i + BATCH_SIZE);
          await Promise.allSettled(
            batch.map(async (job) => {
              const campaign = campMap.get(job.campaign_id);
              if (!campaign) {
                // Campaign deleted, remove job
                await sb.from("guard_pause_jobs").delete().eq("id", job.id);
                return;
              }

              // If pause_required is false (resumed by deposit), remove job
              if (!campaign.pause_required) {
                await sb.from("guard_pause_jobs").delete().eq("id", job.id);
                return;
              }

              // If already confirmed paused, clean up
              if (campaign.status === "paused") {
                await sb.from("campaigns").update({
                  pause_confirmed_at: new Date().toISOString(),
                  pause_required: false,
                }).eq("id", campaign.id);
                await sb.from("guard_pause_jobs").delete().eq("id", job.id);
                totalConfirmed++;
                return;
              }

              const acc = accMap.get(campaign.ad_account_id);
              if (!acc?.api_integration_id) {
                await sb.from("guard_pause_jobs").update({
                  last_error: "No API integration configured",
                  attempts: job.attempts + 1,
                  available_at: new Date(Date.now() + 120000).toISOString(), // retry in 2 min
                }).eq("id", job.id);
                await sb.from("campaigns").update({
                  pause_error: "No API integration configured",
                  pause_attempt_count: (campaign as any).pause_attempt_count + 1,
                }).eq("id", campaign.id);
                totalFailed++;
                return;
              }

              const int = intMap.get(acc.api_integration_id);
              if (!int?.api_token) {
                await sb.from("guard_pause_jobs").update({
                  last_error: "No API token available",
                  attempts: job.attempts + 1,
                  available_at: new Date(Date.now() + 120000).toISOString(),
                }).eq("id", job.id);
                await sb.from("campaigns").update({
                  pause_error: "No API token available",
                  pause_attempt_count: (campaign as any).pause_attempt_count + 1,
                }).eq("id", campaign.id);
                totalFailed++;
                return;
              }

              // Call platform API
              const rawId = campaign.platform_id.replace(/^(meta_|google_|tiktok_)/, "");
              let result: { success: boolean; message: string; localOnly?: boolean };

              if (campaign.platform === "tiktok") {
                result = await pauseTikTokCampaign(acc.ad_account_id, rawId, int.api_token, tiktokBase);
              } else if (campaign.platform === "meta") {
                result = await pauseMetaCampaign(rawId, int.api_token);
              } else if (campaign.platform === "google") {
                const customerId = acc.ad_account_id.replace(/-/g, "");
                result = await pauseGoogleCampaign(customerId, rawId, int.api_token, int.app_id || "");
              } else {
                result = { success: false, message: `Unsupported platform: ${campaign.platform}` };
              }

              if (result.success) {
                // API said success — now VERIFY by reading back the actual status
                let verified = false;
                let verifyMsg = "";
                
                if (result.localOnly) {
                  // Geo-restricted: can't verify, treat as local-only confirmed
                  verified = true;
                  verifyMsg = "geo-restricted, local-only";
                } else {
                  // Wait 1.5s for platform to propagate, then verify
                  await new Promise(r => setTimeout(r, 1500));
                  
                  let verification: { verified: boolean; actualStatus: string | null; error?: string };
                  if (campaign.platform === "tiktok") {
                    verification = await verifyTikTokPaused(acc.ad_account_id, rawId, int.api_token, tiktokBase);
                  } else if (campaign.platform === "meta") {
                    verification = await verifyMetaPaused(rawId, int.api_token);
                  } else if (campaign.platform === "google") {
                    const cid = acc.ad_account_id.replace(/-/g, "");
                    verification = await verifyGooglePaused(cid, rawId, int.api_token, int.app_id || "");
                  } else {
                    verification = { verified: false, actualStatus: null, error: "Unsupported" };
                  }
                  
                  verified = verification.verified;
                  verifyMsg = verified
                    ? `Verified: ${verification.actualStatus}`
                    : `NOT verified — platform says: ${verification.actualStatus || verification.error || "unknown"}`;
                  console.log(`🔍 Verification for ${campaign.name}: ${verifyMsg}`);
                }
                
                if (verified) {
                  // ✅ TRULY confirmed — platform read-back says paused
                  await sb.from("campaigns").update({
                    status: "paused",
                    pause_required: false,
                    pause_confirmed_at: new Date().toISOString(),
                    pause_error: null,
                    pause_attempt_count: job.attempts + 1,
                    updated_at: new Date().toISOString(),
                  }).eq("id", campaign.id);

                  await sb.from("guard_pause_jobs").delete().eq("id", job.id);
                  totalConfirmed++;
                  console.log(`✓ VERIFIED & CONFIRMED: ${campaign.name} (${campaign.platform})`);

                  await sb.from("audit_logs").insert({
                    user_id: campaign.client_id || "00000000-0000-0000-0000-000000000000",
                    action_type: "ad_guard_platform_verified",
                    description: `Platform VERIFIED pause for "${campaign.name}" (${campaign.platform}). ${verifyMsg}. Attempt #${job.attempts + 1}.`,
                  });
                } else {
                  // API said success but verification failed — schedule retry
                  const newAttempts = job.attempts + 1;
                  const backoffMs = Math.min(newAttempts * 30000, 300000); // 30s, 60s, ... max 5min (faster retries)
                  
                  await sb.from("guard_pause_jobs").update({
                    last_error: `API OK but verification failed: ${verifyMsg}`,
                    attempts: newAttempts,
                    available_at: new Date(Date.now() + backoffMs).toISOString(),
                  }).eq("id", job.id);
                  
                  await sb.from("campaigns").update({
                    pause_error: `Verification failed: ${verifyMsg}`.substring(0, 500),
                    pause_attempt_count: newAttempts,
                  }).eq("id", campaign.id);
                  
                  totalFailed++;
                  console.error(`⚠ API said OK but verification FAILED: ${campaign.name} — ${verifyMsg}`);
                  
                  await sb.from("audit_logs").insert({
                    user_id: campaign.client_id || "00000000-0000-0000-0000-000000000000",
                    action_type: "ad_guard_verify_failed",
                    description: `Pause API returned OK but platform verification FAILED for "${campaign.name}" (${campaign.platform}). ${verifyMsg}. Will retry.`,
                  });
                }
              } else {
                // ❌ Failed — update error state, schedule retry
                const newAttempts = job.attempts + 1;
                const backoffMs = Math.min(newAttempts * 60000, 600000); // 1min, 2min, ... max 10min

                if (newAttempts >= MAX_ATTEMPTS) {
                  // Max retries exceeded — mark as failed
                  await sb.from("guard_pause_jobs").update({
                    status: "failed",
                    last_error: result.message,
                    attempts: newAttempts,
                  }).eq("id", job.id);
                } else {
                  await sb.from("guard_pause_jobs").update({
                    last_error: result.message,
                    attempts: newAttempts,
                    available_at: new Date(Date.now() + backoffMs).toISOString(),
                  }).eq("id", job.id);
                }

                await sb.from("campaigns").update({
                  pause_error: result.message.substring(0, 500),
                  pause_attempt_count: newAttempts,
                }).eq("id", campaign.id);

                totalFailed++;
                console.error(`✗ FAILED (attempt ${newAttempts}): ${campaign.name} (${campaign.platform}): ${result.message}`);

                await sb.from("audit_logs").insert({
                  user_id: campaign.client_id || "00000000-0000-0000-0000-000000000000",
                  action_type: "ad_guard_api_error",
                  description: `Platform pause FAILED for "${campaign.name}" (${campaign.platform}), attempt #${newAttempts}: ${result.message.substring(0, 200)}`,
                });
              }
            })
          );
        }
      }
    }

    // ===== PHASE 2: Scan for active campaigns on low-balance clients =====
    // Catches any campaigns that slipped through without a trigger (safety net)
    if (timeLeft() > 5000) {
      const { data: activeCampaigns } = await sb
        .from("campaigns")
        .select("id, name, platform, platform_id, ad_account_id, client_id")
        .in("status", ["active", "enable", "Active"])
        .not("client_id", "is", null);

      if (activeCampaigns && activeCampaigns.length > 0) {
        const clientCampaigns = new Map<string, typeof activeCampaigns>();
        for (const c of activeCampaigns) {
          if (!c.client_id) continue;
          if (!clientCampaigns.has(c.client_id)) clientCampaigns.set(c.client_id, []);
          clientCampaigns.get(c.client_id)!.push(c);
        }

        const clientIds = [...clientCampaigns.keys()];

        for (const clientId of clientIds) {
          if (timeLeft() < 3000) { timedOut = true; break; }

          const { data: creditSum } = await sb
            .from("transactions").select("amount")
            .eq("client_id", clientId).eq("type", "credit").eq("status", "completed");
          const { data: debitSum } = await sb
            .from("transactions").select("amount")
            .eq("client_id", clientId).eq("type", "debit").eq("status", "completed");
          const credits = (creditSum ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
          const debits = (debitSum ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
          const balance = credits - debits;

          const { data: profile } = await sb
            .from("profiles")
            .select("full_name, auto_pause_balance_usd, overdraft_limit_usd, system_paused_campaigns")
            .eq("user_id", clientId)
            .single();

          if (!profile) continue;

          const threshold = Number(profile.auto_pause_balance_usd ?? 5);
          const overdraft = Number(profile.overdraft_limit_usd ?? 0);
          const effectiveThreshold = threshold - overdraft;
          const alreadyPaused = Array.isArray(profile.system_paused_campaigns)
            ? profile.system_paused_campaigns : [];

          if (balance <= effectiveThreshold) {
            const camps = clientCampaigns.get(clientId) || [];
            if (camps.length > 0) {
              const pausedIds: string[] = [];
              const pausedNames: string[] = [];

              for (const campaign of camps) {
                // Mark as guard_paused + pause_required + queue job
                await sb.from("campaigns").update({
                  status: "guard_paused",
                  pause_required: true,
                  pause_requested_at: new Date().toISOString(),
                  pause_confirmed_at: null,
                  pause_attempt_count: 0,
                  pause_error: null,
                  updated_at: new Date().toISOString(),
                }).eq("id", campaign.id);

                // Insert into durable queue
                await sb.from("guard_pause_jobs").upsert({
                  campaign_id: campaign.id,
                  status: "pending",
                  available_at: new Date().toISOString(),
                  last_error: null,
                  attempts: 0,
                }, { onConflict: "campaign_id" });

                pausedIds.push(campaign.id);
                pausedNames.push(campaign.name || campaign.platform_id);
              }

              const allPausedIds = [...new Set([...alreadyPaused.map(String), ...pausedIds])];
              await sb.from("profiles").update({
                system_paused_campaigns: allPausedIds,
                guard_paused_at: new Date().toISOString(),
              }).eq("user_id", clientId);

              await sb.from("audit_logs").insert({
                user_id: clientId,
                action_type: "ad_guard_pause",
                description: `Ad Guard queued ${pausedIds.length} campaigns for ${profile.full_name}: [${pausedNames.join(", ")}]. Balance: $${balance.toFixed(2)} (threshold: $${effectiveThreshold}). Queued for platform pause.`,
              });

              totalNewlyQueued += pausedIds.length;
              results.push({
                client: profile.full_name,
                balance: Math.round(balance * 100) / 100,
                threshold: effectiveThreshold,
                action: "QUEUED_FOR_PAUSE",
                campaigns_queued: pausedIds.length,
              });
            }
          } else {
            results.push({
              client: profile.full_name,
              balance: Math.round(balance * 100) / 100,
              threshold: effectiveThreshold,
              action: "OK",
            });
          }
        }
      }
    }

    // ===== PHASE 3: Re-check failed jobs that may have exceeded max attempts =====
    // Reset failed jobs older than 1 hour to retry again
    if (timeLeft() > 2000) {
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const { data: failedJobs } = await sb
        .from("guard_pause_jobs")
        .select("id, campaign_id")
        .eq("status", "failed")
        .lt("created_at", oneHourAgo)
        .limit(10);

      if (failedJobs && failedJobs.length > 0) {
        for (const job of failedJobs) {
          await sb.from("guard_pause_jobs").update({
            status: "pending",
            attempts: 0,
            available_at: new Date().toISOString(),
            last_error: "Auto-reset after cooldown",
          }).eq("id", job.id);
        }
        console.log(`Phase 3: Reset ${failedJobs.length} failed jobs for retry`);
      }
    }

    const elapsed = Date.now() - START_TIME;
    const checked = results.filter(r => r.action === "OK").length + results.filter(r => r.action === "QUEUED_FOR_PAUSE").length;
    
    return new Response(
      JSON.stringify({
        success: true,
        elapsed_ms: elapsed,
        timed_out: timedOut,
        checked,
        phase1_jobs_processed: pendingJobs?.length ?? 0,
        phase1_confirmed: totalConfirmed,
        phase1_failed: totalFailed,
        phase2_newly_queued: totalNewlyQueued,
        total_campaigns_paused: totalConfirmed + totalNewlyQueued,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("ad-guard-check critical error:", error);
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from("audit_logs").insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        action_type: "ad_guard_critical_error",
        description: `Ad Guard engine failure: ${(error as Error).message}`,
      });
    } catch (_) { /* ignore */ }

    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
