

# Fix: TikTok Campaigns & Spend Not Showing

## Root Cause Analysis

I investigated the database and found **two distinct problems**:

### Problem 1: Campaign Status Mismatch (Why campaigns don't appear)
The Campaigns page injects active campaigns with zero metrics only if `c.status === "active"` (line 160 of CampaignMapping.tsx). However, TikTok campaigns in the database have raw statuses `"enable"` / `"disable"` instead of the normalized `"active"` / `"paused"`. This means your 5 active TikTok campaigns (1 in HEPT 8, 4 in HEPT 15) are **invisible** whenever they have no metrics for the selected date range (e.g. when date filter = today only).

**Evidence**: Database shows HEPT 15 campaigns with `status: "enable"` — the UI check `=== "active"` skips them.

### Problem 2: Spend Gap ($542 in DB vs $718 on TikTok)
The database has **$542.68** total March spend across these 3 accounts. The ~$175 gap likely comes from campaigns on these TikTok ad accounts whose names **don't contain "Musa"** — the system's keyword-matching logic silently skips them. The sync logs show skipped campaigns but doesn't identify which ones.

## Solution

### A. Database Migration — Normalize existing TikTok statuses
Run a one-time migration to fix all existing TikTok campaigns:
- `"enable"` → `"active"`  
- `"disable"` → `"paused"`

### B. `src/pages/CampaignMapping.tsx` — Defensive status check
Change line 160 from `c.status === "active"` to also include `"enable"` and any status starting with `"active"` (e.g. `"active - ad groups paused"`). This prevents future regressions even if raw statuses slip through.

### C. `supabase/functions/sync-deep-dive/index.ts` — Normalize status on write
In the TikTok status fetch section (~line 693), add normalization for raw `"Enable"`/`"Disable"` strings that TikTok sometimes returns as the `status` field (in addition to `operation_status`). This prevents raw values from reaching the DB.

### D. `supabase/functions/sync-deep-dive/index.ts` — Log skipped campaign names
When a campaign is skipped due to no keyword match, log its name so the admin can identify which non-"Musa" campaigns are spending money on these accounts. This will help diagnose the $175 gap.

### E. `supabase/functions/sync-fast-lane/index.ts` — Same normalization + logging
Apply the same status normalization and skipped-campaign logging to the fast-lane function.

## No database schema changes needed — only a data-fix migration + code updates.

