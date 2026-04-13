

## Plan: Advanced Trial Management System

### Current State
- Trial period is **hardcoded to 14 days** in `CreateAgency.tsx` (line 52) and `self-signup` edge function
- Grace period is stored per-org (`grace_period_days`, default 7) but not configurable from UI
- No way to extend/shorten trials for individual agencies
- No trial-specific features (e.g., limit features during trial vs paid)
- `tenant-lifecycle-check` auto-suspends expired trials but there's no manual override
- Self-signup creates orgs with `pending_payment` status (no trial option for self-signups)

### What We'll Build

A full trial control system with platform-level defaults and per-agency overrides.

#### 1. Platform-Level Trial Settings (new section in Platform Plans or Settings)
- **Default trial days** (stored in `settings` table as `default_trial_days`, default 14)
- **Grace period days** (stored as `default_grace_period_days`, default 7)
- **Allow trial for self-signup** toggle — when ON, self-signups start in `trial` status instead of `pending_payment`
- **Trial features mode** — choose whether trial agencies get full plan features or a restricted subset
- Editable from a new "Trial Settings" card on the Platform Plans page

#### 2. Per-Agency Trial Controls (on Agency Detail page)
- **Extend/shorten trial** — date picker to adjust `trial_ends_at` for any agency in trial status
- **Reset trial** — button to restart trial from today (resets `trial_ends_at` to now + configured days)
- **Convert to paid immediately** — skip trial, move straight to active
- **Adjust grace period** — per-agency `grace_period_days` override
- All changes logged to `audit_logs`

#### 3. Create Agency — Dynamic Trial Period
- Replace hardcoded `14 * 86400000` with the platform setting `default_trial_days`
- Add optional "Custom trial days" input field on the Create Agency form
- Same logic applied in `self-signup` edge function when trial is enabled for self-signups

#### 4. Trial Dashboard Enhancements (Tenant Lifecycle page)
- Show trial countdown more prominently with progress bar (days elapsed / total)
- Color-code: green (>7d left), yellow (3-7d), red (<3d), expired
- Quick action buttons: "Extend 7d", "Extend 14d", "Convert to Paid"
- Filter/sort by "expiring soon"

### Files Changed/Created

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/pages/PlatformPlans.tsx` | Add "Trial Settings" card with default trial days, grace period, self-signup trial toggle |
| Modify | `src/pages/CreateAgency.tsx` | Fetch `default_trial_days` from settings, add custom trial days input |
| Modify | `src/pages/AgencyDetail.tsx` | Add trial controls section (extend, reset, convert, grace period) |
| Modify | `src/pages/TenantLifecycle.tsx` | Add trial progress bars, quick extend/convert buttons, expiring-soon filter |
| Modify | `supabase/functions/self-signup/index.ts` | Read trial settings, optionally start in `trial` status |
| Modify | `supabase/functions/tenant-lifecycle-check/index.ts` | Read `default_grace_period_days` from settings instead of hardcoded fallback |
| Migration | Insert default settings rows: `default_trial_days=14`, `default_grace_period_days=7`, `trial_on_self_signup=false` |

### Technical Details

**Settings rows** (inserted via migration, no schema change needed — `settings` table already exists):
- `default_trial_days` = `"14"`
- `default_grace_period_days` = `"7"`
- `trial_on_self_signup` = `"false"`

**CreateAgency.tsx change:**
```text
// Before: new Date(Date.now() + 14 * 86400000)
// After: new Date(Date.now() + trialDays * 86400000)
// where trialDays comes from settings or custom input
```

**AgencyDetail.tsx — new Trial Controls section:**
- Visible only when org status is `trial`
- Date picker bound to `trial_ends_at`
- Grace period number input bound to `grace_period_days`
- "Convert to Active" button updates status directly

**Self-signup edge function:**
- Reads `trial_on_self_signup` setting
- If true: creates org with `status: "trial"`, `trial_ends_at: now + default_trial_days`, skips payment proof requirement
- If false: existing `pending_payment` flow (no change)

