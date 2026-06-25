# Hierarchical Analytics: Campaigns → Ad Sets → Ads

Upgrade analytics to expose the full ad hierarchy (Campaign → Ad Set → Ad) for Meta, TikTok, and Google in **both admin and client views**, with a robust background sync that avoids API rate limits and edge-function CPU timeouts.

---

## 1. UX — Hybrid: Tabs + Expandable Rows

Inside `CampaignAnalyticsPanel` (used by both admin & client):

```text
[ Campaigns ] [ Ad Sets ] [ Ads ]    ← level tabs (in addition to platform tabs)
────────────────────────────────────
▾ Campaign A          $1,240   320 results   ...
   ▾ Ad Set A1         $480    110 results   ...
      • Ad A1-x        $210     60 results   ...
      • Ad A1-y        $270     50 results   ...
   ▸ Ad Set A2         $760    210 results   ...
▸ Campaign B           $980    180 results   ...
```

- **Level tabs**: scope the table to Campaigns / Ad Sets / Ads (flat view, sortable, exportable per level).
- **Expandable rows**: in the Campaigns tab, click ▸ to lazy-render its ad sets, then its ads. Aggregates come from already-synced DB rows (no on-click API call).
- KPI cards at top auto-recompute from the active level.
- **Same full metric set** at every level (spend, results, ROAS, CPM, cost/purchase, messages, etc.) — already supported by `daily_metrics`.

---

## 2. Database — Mirror the Hierarchy

New tables (parallel to `campaigns` / `daily_metrics`):

```text
ad_sets
  id (uuid pk), campaign_id (fk → campaigns.id), platform_id (text),
  name, status, ad_account_id, client_id, org_id,
  budget, optimization_goal, created_at, updated_at
  UNIQUE (ad_account_id, platform_id)

ads
  id (uuid pk), ad_set_id (fk → ad_sets.id), campaign_id (fk),
  platform_id, name, status, creative_thumb_url,
  ad_account_id, client_id, org_id, created_at, updated_at
  UNIQUE (ad_account_id, platform_id)

daily_metrics_adset   -- same 28 columns as daily_metrics, keyed by ad_set_id
daily_metrics_ad      -- same 28 columns as daily_metrics, keyed by ad_id
```

Indexes: `(campaign_id)`, `(ad_set_id)`, `(client_id, data_date)`, `(ad_account_id, data_date)`.
RLS: mirror `campaigns` policies (org-scoped via `get_user_org_id`, client-scoped via `ad_account_clients`).
Grants: standard `authenticated` + `service_role` block per project rule.

> Campaign-level `daily_metrics` stays untouched — backwards compatible, no regression to existing dashboards, finance, ad-guard, or wallet attribution.

---

## 3. Sync Architecture — Background Queue (no CPU timeouts)

Reuses the existing `sync-queue-worker` + `sync_jobs` pattern (already proven, 22 s budget, batches of 5, `Promise.allSettled`).

### New job types
```text
sync_jobs.job_type:
  - sync_adsets_fast      (every 5 min, last 3 days)
  - sync_adsets_deep      (hourly, last 30 days)
  - sync_ads_fast         (every 10 min, last 3 days)
  - sync_ads_deep         (hourly, last 30 days)
```

### Per-platform fetch strategy
| Platform | Endpoint | Pagination | Rate-limit guard |
|---|---|---|---|
| Meta | `/{act_id}/insights?level=adset` / `level=ad` with `fields=...&time_range&breakdowns` | cursor `after` | respect `X-Business-Use-Case-Usage` header, exponential backoff on code 17/4/613 |
| TikTok | `/reports/integrated/get/?data_level=AUCTION_ADGROUP` / `AUCTION_AD` via **US CF Worker proxy** | `page`/`page_size=1000` loop | retry on 40100/41000 |
| Google Ads | GAQL `SELECT ... FROM ad_group` / `FROM ad_group_ad` | `pageToken` | retry on `RESOURCE_EXHAUSTED` |

### CPU-timeout safeguards
1. **Per-invocation hard budget = 18 s** (4 s safety margin). Worker picks one job, processes one ad-account chunk, requeues remainder.
2. **Concurrency**: `Promise.allSettled` in batches of **5 ad accounts** per invocation (existing pattern).
3. **Idempotent upserts** on `UNIQUE (ad_account_id, platform_id)` + composite unique `(entity_id, data_date)` on metrics tables (mirrors `daily_metrics` policy).
4. **Cursor checkpointing**: persist `next_page_token` / `after_cursor` in `sync_jobs.metadata`, so a re-invocation resumes instead of restarting.
5. **Mapping gate** (per project rule): only sync ad sets/ads belonging to campaigns with active client assignment + mapping keyword — avoids syncing thousands of irrelevant ads.
6. **Adaptive throttling**: if API responds with rate-limit header > 75 %, the job sleeps and re-queues itself with a delay.

### Cron (via `pg_cron` + `pg_net`)
```text
*/5  * * * *  → sync-orchestrator(kind='adsets_fast')
*/10 * * * *  → sync-orchestrator(kind='ads_fast')
0    * * * *  → sync-orchestrator(kind='adsets_deep' + 'ads_deep')
```

Orchestrator just enqueues `sync_jobs`; the existing `sync-queue-worker` (already invoked every minute) drains them within its 22 s envelope.

---

## 4. Frontend Changes

### Files touched
- `src/components/client-analytics/CampaignAnalyticsPanel.tsx` — add **Level tabs** (Campaigns/Ad Sets/Ads) wrapping the existing platform tabs.
- `src/components/client-analytics/DeepDiveTable.tsx` — add `expandable` mode; when row expanded, query `ad_sets` (or `ads`) for that parent and render nested `DeepDiveTable` with a left indent.
- New: `src/hooks/useAdSetMetrics.ts`, `src/hooks/useAdMetrics.ts` — paginated queries via `fetchAllRows`, gated by `authReady && !!user`.
- New: `src/lib/aggregateLevels.ts` — pure aggregator that turns daily rows into one row per entity (re-uses logic from `ClientReports.tsx`).
- `src/pages/ClientReports.tsx` & admin equivalent — pass `level` state into the panel; preserve current preset/column preferences per level via `usePresetPreferences`.

### Loading & realtime
- Initial load: skeleton (existing `initialLoading` pattern).
- Expand row: inline spinner only inside that row; data cached in React Query keyed by `(parent_id, dateRange)`.
- Realtime: debounced (2500 ms) channel subscribed to `ad_sets`, `ads`, `daily_metrics_adset`, `daily_metrics_ad` filtered by `client_id`.

### Pause/Resume parity
Reuse `pause-campaign` edge function pattern → add `pause-adset` and `pause-ad` (same multi-platform resilience: Meta/TikTok/Google). Permission flags: extend `client_permissions` with `can_pause_adsets`, `can_pause_ads`, `can_resume_adsets`, `can_resume_ads` (default = inherit campaign flag for backward compat).

---

## 5. Roll-out Phases

| Phase | Deliverable | Risk |
|---|---|---|
| 1 | DB migrations (tables, RLS, grants, indexes) + types regen | low |
| 2 | Meta adset/ad sync workers + cron + integrity checks | medium (API quota) |
| 3 | TikTok + Google sync workers (proxy via existing US CF Worker for TikTok) | medium |
| 4 | Frontend: level tabs + expandable rows in `CampaignAnalyticsPanel` (admin + client) | low |
| 5 | Pause/resume at adset/ad level + permission flags | low |
| 6 | Telemetry: `sync_account_stats` extended with `adsets_synced` / `ads_synced` counters; surface in `SyncHealthMatrix` | low |

---

## 6. Guarantees vs. Existing System

- **No regression**: campaign-level `daily_metrics` untouched; all current dashboards, finance attribution, ad-guard, wallet debits keep working unchanged.
- **No CPU timeouts**: every worker call bounded to 18 s with cursor checkpointing.
- **No rate-limit blowups**: adaptive throttling + mapping gate + chunked batches of 5.
- **Multi-tenant safe**: every new table has `org_id` BEFORE-INSERT trigger and `has_role` / `get_user_org_id` RLS.
- **USD/BDT policy preserved**: ad metrics in USD, untouched billing.

---

## Open question (non-blocking)
Should ad-set & ad **pause/resume** be exposed on day 1, or ship read-only first and add controls in a follow-up? I recommend **read-only first** so we validate sync stability before touching live ad delivery.
