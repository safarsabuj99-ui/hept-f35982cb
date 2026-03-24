

## Plan: Dedicated Sync Health Page with Per-Platform Schedule Configuration

### What You Get
A new standalone **Sync Health** page (`/admin/sync-health`) that consolidates all sync monitoring and adds per-platform schedule controls with recommended intervals displayed inline.

### Page Layout

```text
┌─────────────────────────────────────────────────┐
│  Sync Health                                    │
│  Monitor sync status and configure schedules    │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─ Sync Schedule ─────────────────────────────┐│
│  │                                             ││
│  │  Platform    Interval        Recommended    ││
│  │  ─────────────────────────────────────────  ││
│  │  Meta        [30 min ▼]     ✓ 30 min       ││
│  │  TikTok      [1 hour ▼]     ✓ 1 hour       ││
│  │  Google      [30 min ▼]     ✓ 30 min       ││
│  │                                             ││
│  │  Deep Dive   [1 hour ▼]     ✓ 1-2 hours    ││
│  │                                             ││
│  │  ⓘ Recommendations based on API rate       ││
│  │    limits and data reporting lag.            ││
│  │                                             ││
│  │  [Save Schedule]                            ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  ┌─ Manual Sync ───────────────────────────────┐│
│  │  [Meta] [TikTok] [Google] [Sync All]        ││
│  │  Deep Dive: [Meta] [TikTok] [Google]        ││
│  │  Per-Account: [Select ▼] [▶]               ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  ┌─ Account Health ────────────────────────────┐│
│  │  (existing sync health table moved here)    ││
│  └─────────────────────────────────────────────┘│
│                                                 │
└─────────────────────────────────────────────────┘
```

### Implementation

**1. Database: Add sync schedule settings**
- Insert 4 new rows into `settings` table via migration:
  - `sync_interval_meta_fastlane` = `30` (minutes)
  - `sync_interval_tiktok_fastlane` = `60`
  - `sync_interval_google_fastlane` = `30`
  - `sync_interval_deepdive` = `60`

**2. New page: `src/pages/SyncHealth.tsx`**
- **Schedule Card**: Per-platform dropdowns (15m, 30m, 1h, 2h, 4h) for fast-lane and a single dropdown for deep-dive. Each row shows a "Recommended" badge with rationale:
  - Meta: 30 min (real-time reporting, generous rate limits)
  - TikTok: 1 hour (15-30 min data lag, strict rate limits)
  - Google: 30 min (near real-time, high quotas)
  - Deep Dive: 1-2 hours (heavy payload, TikTok lag)
- **Manual Sync Card**: Move existing manual sync controls from Settings.tsx
- **Account Health Card**: Move existing sync health dashboard from Settings.tsx
- Saves schedule values to `settings` table on click

**3. Route & Navigation**
- Add route `/admin/sync-health` in `App.tsx`
- Add nav link in `AdminLayout.tsx` sidebar

**4. Clean up Settings.tsx**
- Remove the Manual API Sync card and Sync Health Dashboard card (they move to the new page)
- Keep Service Margin, Sync Start Date, TikTok Proxy settings

### Recommendation Info (shown on page)

| Platform | Fast-Lane | Why |
|----------|-----------|-----|
| Meta | 30 min | Real-time reporting API, generous rate limits |
| TikTok | 1 hour | 15-30 min data lag, 10 req/sec limit |
| Google | 30 min | Near real-time data, high API quotas |
| Deep Dive | 1-2 hours | Heavy payload (25+ fields), TikTok bottleneck |

### Files Changed

| File | Change |
|------|--------|
| `src/pages/SyncHealth.tsx` | New page with schedule config + manual sync + health dashboard |
| `src/App.tsx` | Add `/admin/sync-health` route |
| `src/components/AdminLayout.tsx` | Add sidebar nav link |
| `src/pages/Settings.tsx` | Remove manual sync and sync health sections |
| Migration SQL | Insert 4 new settings rows |

