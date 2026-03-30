

# Plan: Make Auto-Pause Work Exactly Like Manual Pause

## The Core Problem
The manual pause (from DeepDiveTable) calls `pause-campaign` edge function for each campaign — and it works every time. But the automatic guard system (`ad-guard-check`) duplicates all the API logic internally with its own pause/verify functions, creating a parallel code path that fails differently.

## The Fix: One Simple Principle
**When balance hits threshold → select all active campaigns → call the same `pause-campaign` function that manual pause uses.**

No duplicate API logic. No separate verification layer. Same function, same result.

## What Changes

### 1. Simplify `ad-guard-check` worker (rewrite core logic)
**File:** `supabase/functions/ad-guard-check/index.ts`

- Remove all duplicate platform API code (pauseTikTokCampaign, pauseMetaCampaign, pauseGoogleCampaign, verifyTikTokPaused, verifyMetaPaused, verifyGooglePaused — ~160 lines of duplicated logic)
- Phase 1 (process queued jobs): Instead of calling platform APIs directly, call `pause-campaign` edge function via HTTP for each campaign — the exact same call the manual UI makes
- This reuses the proven pause logic including geo-restriction handling, status checks, and DB updates
- Process in parallel batches of 5 with the existing timeout guard

```text
Current flow (broken):
  ad-guard-check → own TikTok/Meta/Google API calls → own verification → own DB updates

New flow (same as manual):
  ad-guard-check → calls pause-campaign function → pause-campaign handles everything
```

### 2. Keep the queue + detection system as-is
The `auto_pause_on_debit()` trigger and `guard_pause_jobs` queue work correctly for **detection**. Keep them:
- Trigger detects low balance → marks campaigns `guard_paused` → inserts queue jobs
- Worker processes queue by calling `pause-campaign` for each job
- On success response from `pause-campaign` → mark job done, update `pause_confirmed_at`
- On failure → increment attempts, schedule retry with backoff

### 3. Ensure the cron schedule exists
- Verify the 2-minute cron schedule for `ad-guard-check` is active
- If not present, create it via SQL insert

### 4. Update `pause-campaign` to accept service-role calls for guard pauses
- Already supports `isServiceCall` — verify it handles `guard_paused` status campaigns correctly (it does, line 130 normalizes `guard_paused` → `active` for the check)
- No changes needed here

### 5. Minor UI cleanup
**File:** `src/components/AutomationConfigTab.tsx`
- Keep existing status badges (Verified, Pending, Failed) — they already work correctly with the `pause_confirmed_at` field

## Technical Detail

The rewritten Phase 1 loop in `ad-guard-check` will look like:

```typescript
// For each pending job, call the SAME pause-campaign function
const pauseUrl = `${supabaseUrl}/functions/v1/pause-campaign`;
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
  // pause-campaign already updated DB status to "paused"
  // Just confirm in queue and set pause_confirmed_at
  await sb.from("guard_pause_jobs").delete().eq("id", job.id);
  await sb.from("campaigns").update({
    pause_confirmed_at: new Date().toISOString(),
    pause_required: false,
  }).eq("id", campaign.id);
}
```

## Files Modified
1. `supabase/functions/ad-guard-check/index.ts` — Remove ~300 lines of duplicate API code, replace with calls to `pause-campaign`
2. Verify cron schedule exists (SQL insert if needed)

## What This Guarantees
- Auto-pause uses the **identical code path** as clicking "Pause" in the UI
- If manual pause works → auto-pause works
- No more "UI says paused but platform says active" because there's only one pause implementation
- Queue + retry still provides durability for network failures

