

## Sync Settings — Premium UI Redesign

### What's Wrong With The Current UI

1. **Four disconnected cards** stacked vertically with no narrative flow — user scrolls forever
2. **Two overlapping "health" surfaces**: `SyncQueueHealthCard` (chunk-level) AND `Account Health` (function-level) show overlapping info — confusing
3. **No live "system pulse"** — user can't tell at a glance if sync is healthy
4. **Errors are buried** at the bottom — failed jobs shown in tiny rows with `text-[9px]`
5. **Manual sync** is a wall of buttons — not friendly
6. **Schedule rows** are functional but lack premium feel (plain border, no glow)
7. Doesn't reflect the **new chunked + adaptive engine** — user can't see chunks succeeding in real time

### New Design — Single Unified "Sync Command Center"

A 3-tier composition that tells the story top-to-bottom:

```text
┌─────────────────────────────────────────────────────────────┐
│  TIER 1 — LIVE PULSE (hero card, glassmorphic)              │
│  ●─ pulsing dot + "Sync Engine Healthy" / "Degraded" / etc. │
│  ┌─────────┬─────────┬─────────┬─────────┐                  │
│  │ Pending │ Active  │ Done24h │ Errors  │  big numbers     │
│  │   12    │  3 ◐   │  847 ✓ │   0 ✓   │  with mini trend │
│  └─────────┴─────────┴─────────┴─────────┘                  │
│  [Drain Now] [Sync Everything] [Retry All Errors]           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  TIER 2 — LIVE ACCOUNTS (sliding rail of progress chips)    │
│  Each row = one account currently syncing or recently done. │
│   Account Name        ●─────────────  4/5 chunks · 12s avg  │
│                       progress bar with shimmer              │
│   Subtle: rows/day, last sync, chunk strategy badge          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  TIER 3 — CONTROLS (collapsed accordion, 3 sections)        │
│  ▸ Manual Sync     "Trigger sync for any function/platform" │
│  ▸ Schedule        "Set per-platform sync intervals"        │
│  ▸ Errors & Retry  Empty state when 0 errors — celebratory  │
└─────────────────────────────────────────────────────────────┘
```

### Specific Visual Treatments

**Live Pulse (Tier 1) — the hero**
- Glassmorphic `ios-glass` card with subtle gradient glow that **shifts color by health state**:
  - Healthy → green-tinted glow
  - Degraded → amber-tinted glow
  - Failed → red-tinted glow
- Pulsing status dot (animated ring) next to status text
- KPI tiles use **monospace tabular-nums** for live-counter feel
- Each tile has a tiny trend indicator: ↑12 last hour
- Big primary action buttons with shimmer on hover

**Live Accounts (Tier 2) — the heartbeat**
- Each account is a slim card; in-progress rows show:
  - Animated gradient progress bar (not flat)
  - Live chunk counter (3/5 chunks, current = 4-day window)
  - Soft pulse on the row when an event arrives (highlight then fade)
- Done accounts collapse to a single line with green check
- Sort: in-progress → recently failed → recently done

**Controls (Tier 3) — clean & calm**
- Collapsible accordion (only Manual Sync expanded by default)
- **Manual Sync**: 3 large platform buttons (Meta / TikTok / Google) with brand colors + icons, each shows "Last synced 2m ago" subtitle. One "Sync All" CTA below.
- **Schedule**: same SCHEDULE_ROWS, but each row is a slim glass strip with the "Optimal" pill turning gold when matching recommended
- **Errors**:
  - Empty state: large green check + "All systems clean" + last error timestamp
  - With errors: each failed job is an expandable accordion item showing full error stack, account, chunk dates, retry button. NOT tiny 9px text.

### State Logic (improved feedback)

- **Toast → inline event log**: instead of toast spam, show a 3-line "Recent Activity" feed inside Tier 1 (slides in/out as events arrive). Errors still toast for urgency.
- **Optimistic UI**: clicking "Retry" immediately moves the row to "queuing…" state; reconciles with realtime
- **Loading states**: Use `initialLoading` pattern (shimmer skeletons only on first mount); subsequent updates animate values smoothly
- **Realtime**: subscribe (debounced 1s) to `sync_jobs` table for instant chunk updates — user watches the queue drain live

### Files To Change

| File | Change |
|------|--------|
| `src/components/settings/SyncTab.tsx` | Replace whole layout with new 3-tier composition |
| `src/components/settings/SyncQueueHealthCard.tsx` | Refactor into `SyncPulseCard` (Tier 1 hero) |
| `src/components/settings/sync/SyncAccountsRail.tsx` | **NEW** — Tier 2 live accounts rail |
| `src/components/settings/sync/SyncControlsAccordion.tsx` | **NEW** — Tier 3 controls accordion |
| `src/components/settings/sync/SyncErrorPanel.tsx` | **NEW** — Premium error list with empty state |

### Why This Is Better

| Issue | Before | After |
|-------|--------|-------|
| At-a-glance health | Have to read 4 cards | Single hero pulse |
| See chunks live | Buried in queue card | Tier 2 is dedicated to it |
| Errors visible | 9px text at bottom | Dedicated panel with celebratory empty state |
| Manual sync | Wall of 8 buttons | 3 platform tiles + 1 CTA |
| Premium feel | Plain borders | Glassmorphism + adaptive glow + shimmer |
| Reflects new engine | Mixed old/new model | Built around chunked queue |

### Build Time
~15 minutes. Pure frontend. No DB, no schema, no edge function changes. Same data sources, premium presentation.

