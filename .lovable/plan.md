
# Fully Automated Self-Healing Data Collection System — IMPLEMENTED

## What Was Built

### 1. `sync_logs` Table (NEW)
Tracks every sync attempt per account with status, error codes, retry counts, and row counts. RLS: admin full access, platform_owner read.

### 2. `sync-orchestrator` Edge Function (NEW)
The brain of the system:
- Accepts `{ function: "sync-fast-lane" | "sync-deep-dive" | "sync-ad-spend" }`
- Queries all mapped accounts, sorts by data volume (smallest first)
- Calls target function **one account at a time** with `{ ad_account_ids: [id] }`
- Auto-retries failed accounts up to 3 times with exponential backoff
- Classifies errors: `token_expired`, `geo_blocked`, `rate_limited`, `cpu_timeout`, `api_error`
- Logs every attempt to `sync_logs`
- Alerts via `billing_notifications` for token expiry (7-day warning) and persistent failures (5+)
- Auto-cleans logs older than 30 days

### 3. Updated Sync Functions
All three (`sync-deep-dive`, `sync-fast-lane`, `sync-ad-spend`) now return structured `{ ok, error_code, rows_synced }` responses for orchestrator classification.

### 4. Cron Jobs (pg_cron)
| Job | Schedule | Target |
|-----|----------|--------|
| `orchestrator-fast-lane` | Every 15 min | sync-orchestrator → sync-fast-lane |
| `orchestrator-deep-dive` | Every hour | sync-orchestrator → sync-deep-dive |
| `orchestrator-ad-spend` | Every 30 min | sync-orchestrator → sync-ad-spend |

### 5. Sync Health Dashboard (Settings Page)
- Per-account sync status with green/red indicators
- Last sync time per function per account
- Error codes displayed for failed syncs
- "Force Retry" button for failed accounts
- Auto-refreshing UI
