

## Sync Health Panel — Per-Account Health Matrix

### What To Add

A new **Tier 2.5** section between the Live Accounts Rail and the Controls Accordion: a **"Account Health Matrix"** showing per-account health scores for both Fast-Lane and Deep-Dive lanes side-by-side.

### Design

```text
┌────────────────────────────────────────────────────────────────────────┐
│  ⚡ Account Health Matrix                          [All ▾] [Refresh ↻] │
│  ────────────────────────────────────────────────────────────────────  │
│  Account              Fast-Lane         Deep-Dive        Last Issue   │
│  ─────────────────    ──────────────    ──────────────   ──────────── │
│  Sabuj Meta Pro    │  ●  Excellent  │  ●  Excellent  │  —            │
│                    │  100% · 2m ago │  100% · 1h ago │               │
│  ─────────────────────────────────────────────────────────────────────│
│  Rahim Tiktok BC   │  ●  Healthy    │  ◐  Degraded   │  Geo 41000    │
│                    │  92% · 5m ago  │  60% · 6h ago  │  3 chunks failed│
│  ─────────────────────────────────────────────────────────────────────│
│  Karim Google Ads  │  ●  Critical   │  ●  Critical   │  Token expired│
│                    │  0% · 2d ago   │  0% · 2d ago   │  Refresh now →│
└────────────────────────────────────────────────────────────────────────┘
```

### Health Score Logic (computed client-side from `sync_jobs` last 24h)

| Status | Score | Color | Trigger |
|--------|-------|-------|---------|
| **Excellent** | 95-100% | emerald | All chunks done, 0 failures, last sync <30min |
| **Healthy** | 75-94% | green | <2 failures, last sync <2h |
| **Degraded** | 40-74% | amber | Failures present OR last sync 2-24h |
| **Critical** | <40% | red | Token expired / >3 consecutive failures / no sync >24h |
| **Idle** | — | muted | No jobs in 24h (paused account) |

Score formula per lane:
```
score = (done / (done + failed + pending_old)) * 100
       - (consecutive_failures × 10)
       - (hours_since_last_sync > 2 ? 20 : 0)
```

### What Each Row Shows

Per account, two side-by-side health pills (Fast-Lane | Deep-Dive):
- Status dot (with pulse animation if currently syncing)
- Score % + relative time of last successful sync
- Tiny chunks completed/total mini-bar
- **Issue summary** column: error code (e.g., "Geo 41000", "Token expired", "Rate limited") + suggested action

### Filters & Interactions
- **Top filter**: All / Critical / Degraded / Healthy (counts shown)
- **Sort**: Worst-first by default
- **Click row** → expandable drawer showing last 10 jobs per lane with timestamps, durations, errors
- **Quick action**: per-row "Force Re-sync" (Fast-Lane or Deep-Dive button)

### Data Source (no schema changes)

Single query per refresh, joins:
- `sync_jobs` last 24h grouped by `(ad_account_id, function_name)`
- `sync_account_stats` for `consecutive_failures`, `last_full_sync_at`
- `api_integrations` for token expiry → marks "Critical: token expires in Nd"
- `ad_accounts` for `account_name` and `is_active`

Compute health entirely in React — no edge function needed.

### Files To Change

| File | Change |
|------|--------|
| `src/components/settings/sync/SyncHealthMatrix.tsx` | **NEW** — matrix table with health pills |
| `src/components/settings/sync/SyncHealthRow.tsx` | **NEW** — single row component (account + 2 lane pills + issue) |
| `src/components/settings/sync/healthScore.ts` | **NEW** — pure scoring helpers |
| `src/components/settings/SyncTab.tsx` | Add data fetch for per-lane stats + render `<SyncHealthMatrix />` between Rail and Controls |

### Premium Touches
- Glassmorphic panel matching existing Pulse Card style
- Pulsing dot on actively-syncing accounts (subtle, not distracting)
- Critical rows have soft red glow border
- Empty state when no accounts mapped: "No accounts connected — connect Meta/TikTok/Google to start tracking health"
- All updates piggyback on existing 1s-debounced realtime + 15s poll already wired up

### Why This Beats The Previous Health Card

| Old | New |
|-----|-----|
| Single global "queue health" number | Per-account, per-lane breakdown |
| No distinction between Fast-Lane/Deep-Dive | Side-by-side comparison reveals lane-specific issues |
| Errors buried in failed-jobs list | Issue summary inline with suggested fix |
| No quick action | Force re-sync button per row |
| No filtering | Filter by status, sort by worst |

### Build Time
~12 minutes. Pure frontend additions. Zero schema, zero edge function changes. Reuses existing realtime subscription and refresh cycle.

