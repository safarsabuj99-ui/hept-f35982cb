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

    // Auth: accept service role key, anon key (cron), or admin JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

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

    let totalConfirmed = 0;
    let totalFailed = 0;
    let totalNewlyQueued = 0;
    let timedOut = false;
    const results: any[] = [];

    // The URL of the pause-campaign edge function — the SAME one the manual UI uses
    const pauseUrl = `${supabaseUrl}/functions/v1/pause-campaign`;

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

      // Pre-fetch campaign data to check status before calling
      const campaignIds = pendingJobs.map(j => j.campaign_id);
      const { data: campaigns } = await sb
        .from("campaigns")
        .select("id, name, platform, client_id, status, pause_required")
        .in("id", campaignIds);

      const campMap = new Map((campaigns || []).map(c => [c.id, c]));

      // Process in batches of BATCH_SIZE
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

            // If campaign was resumed by deposit (status back to active AND pause_required false), remove job
            if (!campaign.pause_required && campaign.status !== "guard_paused") {
              await sb.from("guard_pause_jobs").delete().eq("id", job.id);
              return;
            }

            // If instant trigger already confirmed the pause, just clean up the job
            if (campaign.pause_confirmed_at) {
              await sb.from("guard_pause_jobs").delete().eq("id", job.id);
              totalConfirmed++;
              console.log(`✓ ALREADY CONFIRMED (instant trigger): ${campaign.name} (${campaign.platform})`);
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

            // === Call the SAME pause-campaign function that manual pause uses ===
            try {
              const res = await fetch(pauseUrl, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${serviceRoleKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ campaign_id: job.campaign_id, action: "pause" }),
              });

              const result = await res.json();

              if (result.success) {
                // pause-campaign already updated DB status to "paused" and set pause_confirmed_at
                // Just clean up the queue job
                await sb.from("guard_pause_jobs").delete().eq("id", job.id);
                totalConfirmed++;
                console.log(`✓ CONFIRMED: ${campaign.name} (${campaign.platform}) — paused via pause-campaign`);

                await sb.from("audit_logs").insert({
                  user_id: campaign.client_id || "00000000-0000-0000-0000-000000000000",
                  action_type: "ad_guard_platform_verified",
                  description: `Ad Guard confirmed pause for "${campaign.name}" (${campaign.platform}) via pause-campaign. Attempt #${job.attempts + 1}. ${result.message || ""}`,
                });
              } else {
                // pause-campaign returned an error
                const newAttempts = job.attempts + 1;
                const errorMsg = result.error || "Unknown error from pause-campaign";

                if (newAttempts >= MAX_ATTEMPTS) {
                  await sb.from("guard_pause_jobs").update({
                    status: "failed",
                    last_error: errorMsg,
                    attempts: newAttempts,
                  }).eq("id", job.id);
                } else {
                  const backoffMs = Math.min(newAttempts * 60000, 600000);
                  await sb.from("guard_pause_jobs").update({
                    last_error: errorMsg,
                    attempts: newAttempts,
                    available_at: new Date(Date.now() + backoffMs).toISOString(),
                  }).eq("id", job.id);
                }

                await sb.from("campaigns").update({
                  pause_error: errorMsg.substring(0, 500),
                  pause_attempt_count: newAttempts,
                }).eq("id", campaign.id);

                totalFailed++;
                console.error(`✗ FAILED (attempt ${newAttempts}): ${campaign.name} (${campaign.platform}): ${errorMsg}`);

                await sb.from("audit_logs").insert({
                  user_id: campaign.client_id || "00000000-0000-0000-0000-000000000000",
                  action_type: "ad_guard_api_error",
                  description: `Ad Guard pause FAILED for "${campaign.name}" (${campaign.platform}), attempt #${newAttempts}: ${errorMsg.substring(0, 200)}`,
                });
              }
            } catch (fetchErr: any) {
              // Network error calling pause-campaign
              const newAttempts = job.attempts + 1;
              const errorMsg = `Network error calling pause-campaign: ${fetchErr.message || "unknown"}`;
              const backoffMs = Math.min(newAttempts * 30000, 300000);

              await sb.from("guard_pause_jobs").update({
                last_error: errorMsg,
                attempts: newAttempts,
                available_at: new Date(Date.now() + backoffMs).toISOString(),
              }).eq("id", job.id);

              await sb.from("campaigns").update({
                pause_error: errorMsg.substring(0, 500),
                pause_attempt_count: newAttempts,
              }).eq("id", campaign.id);

              totalFailed++;
              console.error(`✗ NETWORK ERROR (attempt ${newAttempts}): ${campaign.name}: ${errorMsg}`);
            }
          })
        );
      }
    }

    // ===== PHASE 2: Scan for active campaigns on low-balance clients (safety net) =====
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
                await sb.from("campaigns").update({
                  status: "guard_paused",
                  pause_required: true,
                  pause_requested_at: new Date().toISOString(),
                  pause_confirmed_at: null,
                  pause_attempt_count: 0,
                  pause_error: null,
                  updated_at: new Date().toISOString(),
                }).eq("id", campaign.id);

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

    // ===== PHASE 2.5: Re-queue stuck guard_paused campaigns with no queue entry =====
    if (timeLeft() > 5000) {
      const { data: stuckCampaigns } = await sb
        .from("campaigns")
        .select("id, name, platform, client_id")
        .eq("status", "guard_paused")
        .not("client_id", "is", null);

      if (stuckCampaigns && stuckCampaigns.length > 0) {
        // Check which ones have NO queue entry
        const stuckIds = stuckCampaigns.map(c => c.id);
        const { data: existingJobs } = await sb
          .from("guard_pause_jobs")
          .select("campaign_id")
          .in("campaign_id", stuckIds);
        const jobSet = new Set((existingJobs || []).map(j => j.campaign_id));

        let requeued = 0;
        for (const camp of stuckCampaigns) {
          if (jobSet.has(camp.id)) continue; // Already has a job
          // Re-queue with pause_required = true
          await sb.from("campaigns").update({
            pause_required: true,
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
