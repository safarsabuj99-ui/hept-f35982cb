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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceRoleKey);

    // Auth: accept service role key directly, or decode JWT to check role
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    let isTrustedCall = token === serviceRoleKey;

    if (!isTrustedCall && token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        if (payload.role === "anon" || payload.role === "service_role") {
          isTrustedCall = true;
        }
      } catch (_e) {
        // Not a valid JWT — fall through to user auth check
      }
    }

    if (!isTrustedCall) {
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

    console.log(`ad-guard-check invoked (trusted=${isTrustedCall}) at ${new Date().toISOString()}`);

    let totalConfirmed = 0;
    let totalFailed = 0;
    let totalNewlyQueued = 0;
    let timedOut = false;
    const results: any[] = [];

    const pauseUrl = `${supabaseUrl}/functions/v1/pause-campaign`;

    // Helper: attempt to pause a single campaign via pause-campaign function
    async function attemptPause(campaignId: string, campaignName: string, platform: string, clientId: string | null, attemptNum: number, jobId?: number): Promise<boolean> {
      try {
        const res = await fetch(pauseUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ campaign_id: campaignId, action: "pause" }),
        });

        const result = await res.json();

        if (result.success) {
          // Clean up queue job if exists
          if (jobId) {
            await sb.from("guard_pause_jobs").delete().eq("id", jobId);
          }

          await sb.from("campaigns").update({
            pause_confirmed_at: new Date().toISOString(),
            pause_required: false,
          }).eq("id", campaignId);

          totalConfirmed++;
          console.log(`✓ CONFIRMED: ${campaignName} (${platform}) — paused via pause-campaign`);

          await sb.from("audit_logs").insert({
            user_id: clientId || "00000000-0000-0000-0000-000000000000",
            action_type: "ad_guard_platform_verified",
            description: `Ad Guard confirmed pause for "${campaignName}" (${platform}) via pause-campaign. Attempt #${attemptNum}. ${result.message || ""}`,
          });
          return true;
        } else {
          const errorMsg = result.error || "Unknown error from pause-campaign";

          if (jobId) {
            if (attemptNum >= MAX_ATTEMPTS) {
              await sb.from("guard_pause_jobs").update({
                status: "failed",
                last_error: errorMsg,
                attempts: attemptNum,
              }).eq("id", jobId);
            } else {
              const backoffMs = Math.min(attemptNum * 60000, 600000);
              await sb.from("guard_pause_jobs").update({
                last_error: errorMsg,
                attempts: attemptNum,
                available_at: new Date(Date.now() + backoffMs).toISOString(),
              }).eq("id", jobId);
            }
          }

          await sb.from("campaigns").update({
            pause_error: errorMsg.substring(0, 500),
            pause_attempt_count: attemptNum,
          }).eq("id", campaignId);

          totalFailed++;
          console.error(`✗ FAILED (attempt ${attemptNum}): ${campaignName} (${platform}): ${errorMsg}`);

          await sb.from("audit_logs").insert({
            user_id: clientId || "00000000-0000-0000-0000-000000000000",
            action_type: "ad_guard_api_error",
            description: `Ad Guard pause FAILED for "${campaignName}" (${platform}), attempt #${attemptNum}: ${errorMsg.substring(0, 200)}`,
          });
          return false;
        }
      } catch (fetchErr: any) {
        const errorMsg = `Network error calling pause-campaign: ${fetchErr.message || "unknown"}`;
        const backoffMs = Math.min(attemptNum * 30000, 300000);

        if (jobId) {
          await sb.from("guard_pause_jobs").update({
            last_error: errorMsg,
            attempts: attemptNum,
            available_at: new Date(Date.now() + backoffMs).toISOString(),
          }).eq("id", jobId);
        }

        await sb.from("campaigns").update({
          pause_error: errorMsg.substring(0, 500),
          pause_attempt_count: attemptNum,
        }).eq("id", campaignId);

        totalFailed++;
        console.error(`✗ NETWORK ERROR (attempt ${attemptNum}): ${campaignName}: ${errorMsg}`);
        return false;
      }
    }

    // ===== PHASE 1: Process queued jobs by calling pause-campaign =====
    const { data: pendingJobs } = await sb
      .from("guard_pause_jobs")
      .select("id, campaign_id, attempts, status")
      .eq("status", "pending")
      .lte("available_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(50);

    if (pendingJobs && pendingJobs.length > 0) {
      console.log(`Phase 1: ${pendingJobs.length} pending pause jobs to process`);

      const campaignIds = pendingJobs.map(j => j.campaign_id);
      const { data: campaigns } = await sb
        .from("campaigns")
        .select("id, name, platform, client_id, status, pause_required, pause_confirmed_at")
        .in("id", campaignIds);

      const campMap = new Map((campaigns || []).map(c => [c.id, c]));

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
              await sb.from("guard_pause_jobs").delete().eq("id", job.id);
              return;
            }

            // If campaign was resumed by deposit, remove job
            if (!campaign.pause_required && campaign.status !== "guard_paused") {
              await sb.from("guard_pause_jobs").delete().eq("id", job.id);
              return;
            }

            // If already confirmed
            if (campaign.pause_confirmed_at) {
              await sb.from("guard_pause_jobs").delete().eq("id", job.id);
              totalConfirmed++;
              console.log(`✓ ALREADY CONFIRMED: ${campaign.name} (${campaign.platform})`);
              return;
            }

            if (campaign.status === "paused") {
              await sb.from("campaigns").update({
                pause_confirmed_at: new Date().toISOString(),
                pause_required: false,
              }).eq("id", campaign.id);
              await sb.from("guard_pause_jobs").delete().eq("id", job.id);
              totalConfirmed++;
              return;
            }

            await attemptPause(campaign.id, campaign.name, campaign.platform, campaign.client_id, job.attempts + 1, job.id);
          })
        );
      }
    }

    // ===== PHASE 2: Scan for active campaigns on low-balance clients + IMMEDIATE pause =====
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
                // Mark as guard_paused
                await sb.from("campaigns").update({
                  status: "guard_paused",
                  pause_required: true,
                  pause_requested_at: new Date().toISOString(),
                  pause_confirmed_at: null,
                  pause_attempt_count: 0,
                  pause_error: null,
                  updated_at: new Date().toISOString(),
                }).eq("id", campaign.id);

                pausedIds.push(campaign.id);
                pausedNames.push(campaign.name || campaign.platform_id);
              }

              // Update profile
              const allPausedIds = [...new Set([...alreadyPaused.map(String), ...pausedIds])];
              await sb.from("profiles").update({
                system_paused_campaigns: allPausedIds,
                guard_paused_at: new Date().toISOString(),
              }).eq("user_id", clientId);

              await sb.from("audit_logs").insert({
                user_id: clientId,
                action_type: "ad_guard_pause",
                description: `Ad Guard queued ${pausedIds.length} campaigns for ${profile.full_name}: [${pausedNames.join(", ")}]. Balance: $${balance.toFixed(2)} (threshold: $${effectiveThreshold}).`,
              });

              // === IMMEDIATE PAUSE: Try to pause on platform right now ===
              for (const campaign of camps) {
                if (timeLeft() < 3000) { timedOut = true; break; }

                const success = await attemptPause(
                  campaign.id,
                  campaign.name || campaign.platform_id,
                  campaign.platform,
                  clientId,
                  1
                );

                if (!success) {
                  // Queue for retry if immediate attempt failed
                  await sb.from("guard_pause_jobs").upsert({
                    campaign_id: campaign.id,
                    status: "pending",
                    available_at: new Date(Date.now() + 60000).toISOString(),
                    last_error: "Immediate attempt failed, queued for retry",
                    attempts: 1,
                  }, { onConflict: "campaign_id" });
                } else {
                  // Clean up queue entry if it exists
                  await sb.from("guard_pause_jobs").delete().eq("campaign_id", campaign.id);
                }
              }

              totalNewlyQueued += pausedIds.length;
              results.push({
                client: profile.full_name,
                balance: Math.round(balance * 100) / 100,
                threshold: effectiveThreshold,
                action: "PAUSED",
                campaigns_count: pausedIds.length,
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

    // ===== PHASE 2.5: Re-queue stuck guard_paused campaigns with no queue entry =====
    if (timeLeft() > 5000) {
      const { data: stuckCampaigns } = await sb
        .from("campaigns")
        .select("id, name, platform, client_id")
        .eq("status", "guard_paused")
        .eq("pause_required", true)
        .is("pause_confirmed_at", null)
        .not("client_id", "is", null);

      if (stuckCampaigns && stuckCampaigns.length > 0) {
        const stuckIds = stuckCampaigns.map(c => c.id);
        const { data: existingJobs } = await sb
          .from("guard_pause_jobs")
          .select("campaign_id")
          .in("campaign_id", stuckIds);
        const jobSet = new Set((existingJobs || []).map(j => j.campaign_id));

        let requeued = 0;
        for (const camp of stuckCampaigns) {
          if (jobSet.has(camp.id)) continue;
          await sb.from("campaigns").update({
            pause_attempt_count: 0,
            pause_error: null,
          }).eq("id", camp.id);
          await sb.from("guard_pause_jobs").upsert({
            campaign_id: camp.id,
            status: "pending",
            available_at: new Date().toISOString(),
            last_error: "Re-queued by safety net",
            attempts: 0,
          }, { onConflict: "campaign_id" });
          requeued++;
          console.log(`🔄 Re-queued stuck campaign: ${camp.name} (${camp.platform})`);
        }
        if (requeued > 0) {
          totalNewlyQueued += requeued;
          console.log(`Phase 2.5: Re-queued ${requeued} stuck guard_paused campaigns`);
        }
      }
    }

    // ===== PHASE 3: Re-check failed jobs older than 1 hour =====
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

    return new Response(
      JSON.stringify({
        success: true,
        elapsed_ms: elapsed,
        timed_out: timedOut,
        phase1_jobs_processed: pendingJobs?.length ?? 0,
        phase1_confirmed: totalConfirmed,
        phase1_failed: totalFailed,
        phase2_newly_queued: totalNewlyQueued,
        total_campaigns_paused: totalConfirmed,
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
