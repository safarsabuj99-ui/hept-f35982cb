

The user is reinforcing the plan from my previous turn but with a sharper, simpler rule: **Deep-Dive should only run for accounts where Fast-Lane just returned data**. No data in Fast-Lane = skip Deep-Dive entirely.

This is even cleaner than my previous "tier-based" proposal. Let me simplify.

## Smart Deep-Dive Gating — Fast-Lane Drives Deep-Dive

### The Rule (Simple & Clear)
- **Fast-Lane runs always** for all mapped accounts (it's cheap, 1-day window)
- **Deep-Dive runs ONLY for accounts where Fast-Lane returned ≥1 row in the last run**
- No data in Fast-Lane = account is silent/dead/paused → **skip Deep-Dive**
- Auto-recovery: the moment Fast-Lane sees data again → Deep-Dive resumes next cycle

### Why This Is Smart
- Saves ~50-80% of Deep-Dive API calls (most accounts are silent at any given hour)
- Self-healing — no manual flagging needed
- Token errors stay separate (those are "Critical", not "no data")
- Reflects reality: if today has no spend, the 25-day historical pull is wasted compute

### Implementation

**1. Track Fast-Lane signal per account** (1 small migration)

Add 3 columns to `sync_account_stats`:
- `last_fast_lane_at` — timestamp of last fast-lane run
- `last_fast_lane_rows` — rows returned (0 = silent)
- `consecutive_zero_runs` — counter (resets on any rows)

**2. Update `sync-fast-lane`** — at end of each run, upsert these stats per account.

**3. Update `sync-orchestrator`** — when enqueuing Deep-Dive jobs:
```
For each mapped account:
  - If last_fast_lane_rows > 0 → enqueue Deep-Dive ✓
  - If last_fast_lane_rows = 0 AND consecutive_zero_runs < 3 → enqueue (grace period)
  - If consecutive_zero_runs >= 3 → SKIP Deep-Dive
  - If never had a fast-lane run → enqueue (first-time accounts)
  - Heartbeat: every 24h, force one Deep-Dive even for skipped accounts (catch reactivations)
```

**4. UI surface in Sync Health Matrix** — add a 3rd pill per row:

```
Account            Fast-Lane      Deep-Dive       Activity        Issue
Sabuj Meta Pro  │  ● Healthy   │  ● Healthy    │  ● Live        │  —
Rahim TT BC     │  ● Healthy   │  ◐ Pending    │  ● Live (12 rows) │  —
Old Test Acct   │  ● Healthy   │  ⊘ Skipped    │  ○ Silent (3 runs)│  No spend today
Dead Acct       │  ● Healthy   │  ⊘ Skipped    │  ● Dormant 26h │  Heartbeat in 14h
```

**5. Admin override** — per row, "Force Deep-Dive Now" button bypasses the skip for one cycle (for manual debugging).

### Files To Change

| File | Change |
|------|--------|
| Migration | Add 3 columns to `sync_account_stats` |
| `supabase/functions/sync-fast-lane/index.ts` | Update `last_fast_lane_rows` + `consecutive_zero_runs` after each run |
| `supabase/functions/sync-orchestrator/index.ts` | Gate Deep-Dive enqueue on Fast-Lane signal + 24h heartbeat |
| `src/components/settings/sync/healthScore.ts` | Add `ActivityTier` (live/silent/dormant) + helper |
| `src/components/settings/sync/SyncHealthRow.tsx` | Add "Activity" pill column |
| `src/components/settings/sync/SyncHealthMatrix.tsx` | Fetch activity stats, add filter chip "Show silent/dormant" |
| `src/components/settings/SyncTab.tsx` | Pass activity data to matrix |

### Edge Cases Handled
- **New accounts**: no record yet → enqueue Deep-Dive normally (first run gathers baseline)
- **Off-hours quiet**: 1-2 zero runs is normal → grace period prevents false skip
- **Reactivation**: any non-zero Fast-Lane immediately resets → Deep-Dive resumes next cycle
- **Heartbeat safety**: even "skipped" accounts get one Deep-Dive every 24h → catches accounts that came alive without spend (e.g., metadata-only changes)
- **Token expired**: still flagged Critical separately (this gating is purely about "no data", not failures)

### Build Time
~20 minutes. 1 migration (3 additive columns), 2 edge function tweaks, 4 frontend updates. Zero breaking changes — existing accounts default to enqueuing until first fast-lane signal.

