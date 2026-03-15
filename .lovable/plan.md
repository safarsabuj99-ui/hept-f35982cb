

## Plan: Fully Automated Self-Healing Data Collection System

### Current Problems

1. **CPU Timeout**: `sync-deep-dive` processes ALL accounts in one call, hits 60s CPU limit before finishing (HEPT 8 gets skipped every time)
2. **No automatic retry**: Failed accounts are never retried
3. **No failure tracking**: No table records which accounts failed, why, or when
4. **No self-healing**: Expired tokens, geo-blocks, API errors are not detected or auto-resolved
5. **`sync-ad-spend` not scheduled**: Only runs manually — no cron job exists for it
6. **No alerting**: Admin has no visibility into sync health without checking logs manually

### Architecture: Orchestrator + Per-Account Workers

```text
┌──────────────────────────────────────────────────────────┐
│                    CRON SCHEDULER (pg_cron)               │
├──────────┬──────────┬──────────┬──────────┬───────────────┤
│ Fast Lane│ Deep Dive│ Ad Spend │ Billing  │ Health Check  │
│ */15 min │ */60 min │ */30 min │ hourly   │ */30 min      │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴───────┬───────┘
     │          │          │          │             │
     ▼          ▼          ▼          ▼             ▼
┌─────────────────────────────────────────────────────────┐
│              sync-orchestrator (NEW)                     │
│  1. Query all mapped accounts                            │
│  2. For EACH account, call the target function with      │
│     { ad_account_ids: [single_id] }                      │
│  3. Record success/failure in sync_logs table            │
│  4. Auto-retry failed accounts (max 3 attempts)          │
│  5. Detect token expiry → log alert                      │
│  6. Detect geo-block → log alert                         │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              sync_logs TABLE (NEW)                        │
│  account_id, function_name, status, error_message,       │
│  error_code, retry_count, started_at, completed_at       │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│         Sync Health Dashboard (Settings page)            │
│  Per-account sync status, last success, error history,   │
│  auto-retry status, token health indicators              │
└─────────────────────────────────────────────────────────┘
```

### Changes

#### 1. New Database Table: `sync_logs`

Tracks every sync attempt per account per function:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | PK |
| `ad_account_id` | uuid | Which account |
| `function_name` | text | Which sync function ran |
| `status` | text | `success`, `failed`, `retrying`, `timeout` |
| `error_message` | text | API error details |
| `error_code` | text | e.g. `41000`, `token_expired`, `cpu_timeout` |
| `rows_synced` | integer | How many rows processed |
| `retry_count` | integer | Attempt number (0-3) |
| `started_at` | timestamptz | When sync began |
| `completed_at` | timestamptz | When sync ended |
| `created_at` | timestamptz | Record creation |

RLS: Admin full access, platform_owner read access.

#### 2. New Edge Function: `sync-orchestrator`

The brain of the system. Accepts `{ function: "sync-deep-dive" | "sync-fast-lane" | "sync-ad-spend" }` and:

1. Queries all mapped ad accounts
2. Calls the target function **one account at a time** via `{ ad_account_ids: [id] }`
3. Catches and classifies errors:
   - `token_expired` → Meta error 190, TikTok error 40001
   - `geo_blocked` → TikTok error 41000
   - `rate_limited` → HTTP 429
   - `cpu_timeout` → function didn't respond
   - `api_error` → anything else
4. Logs every attempt to `sync_logs`
5. Auto-retries failed accounts (up to 3 attempts with exponential backoff)
6. Inserts alerts into `billing_notifications` for persistent failures

This completely solves the CPU timeout problem — each account gets its own function invocation with the full 60s budget.

#### 3. Update Existing Sync Functions

Add structured error responses so the orchestrator can classify failures:
- Return `{ ok: true/false, error_code: "...", rows_synced: N }` instead of just throwing
- Each function already supports `ad_account_ids` filter (added previously)

#### 4. New Cron Jobs

| Job | Schedule | Target |
|-----|----------|--------|
| `orchestrator-fast-lane` | `*/15 * * * *` | `sync-orchestrator` with `{ function: "sync-fast-lane" }` |
| `orchestrator-deep-dive` | `0 * * * *` | `sync-orchestrator` with `{ function: "sync-deep-dive" }` |
| `orchestrator-ad-spend` | `*/30 * * * *` | `sync-orchestrator` with `{ function: "sync-ad-spend" }` |

Replaces the existing direct cron jobs that call functions with ALL accounts at once.

#### 5. Sync Health Dashboard (Settings Page Enhancement)

Add a new "Sync Health" section showing:
- Per-account last sync status (green/red indicator)
- Last successful sync timestamp per account
- Error history with error codes
- Retry status (how many retries remaining)
- Token health: days until expiry from `api_integrations.token_expiry_date`
- One-click "Force Retry" button for failed accounts
- Auto-cleanup: purge sync_logs older than 30 days

#### 6. Self-Healing Logic

Built into the orchestrator:
- **Token Expiry Warning**: If `token_expiry_date` is within 7 days, create a `billing_notification` alert
- **Consecutive Failures**: If an account fails 5+ times consecutively across runs, auto-disable it and alert admin
- **Geo-block Detection**: If TikTok 41000 persists after proxy retries, log specific diagnostic info
- **Stale Data Detection**: If an account hasn't synced successfully in 24h+, flag it in the health dashboard

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/sync-orchestrator/index.ts` | **NEW** — orchestrator logic |
| `supabase/functions/sync-deep-dive/index.ts` | Return structured `{ ok, error_code, rows_synced }` |
| `supabase/functions/sync-fast-lane/index.ts` | Return structured response |
| `supabase/functions/sync-ad-spend/index.ts` | Return structured response |
| `supabase/config.toml` | Add `sync-orchestrator` with `verify_jwt = false` |
| `src/pages/Settings.tsx` | Add Sync Health dashboard section |
| Database migration | Create `sync_logs` table + RLS |
| Cron jobs | Replace 3 existing jobs with orchestrator-based jobs |

### Implementation Order

1. Create `sync_logs` table with RLS
2. Build `sync-orchestrator` edge function
3. Update 3 sync functions with structured error responses
4. Replace cron jobs to use orchestrator
5. Add Sync Health UI to Settings page

