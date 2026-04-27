# Fix global search popup — match client-side balance display rule

## The bug

The Cmd+K **client search popup** (top of `/admin` dashboard) labels every balance as `BDT` and prints the raw USD number. So a $155 USD credit shows as `155 BDT`, and a $10 USD debt shows as `−10 BDT`. Both the unit and the magnitude are wrong for negatives.

The rest of the platform (Client List, Client Detail, Client Dashboard) follows one consistent rule:

- **Positive balance** → USD: `$X.XX` (this IS the real stored value, no conversion)
- **Negative balance (debt)** → BDT: `−৳Y.YY`, converted from USD using each client's **per-platform billing rate** in `pricing_config` (Meta / TikTok / Google rates, defaulting to 120 if missing)

The search popup is the only place violating this rule.

## Why the conversion needs per-platform rates

A client can owe debt across multiple platforms simultaneously, and each platform may have a different rate (e.g. Meta 122, TikTok 120, Google 125). Total BDT debt is:

```text
bdt_due = Σ over [meta, tiktok, google] of  max(0, -platform_balance[p]) * rate[p]
```

This is exactly what `ClientList.tsx` already computes (lines 162–181 of that file) using the shared helper `getPlatformRates` from `src/lib/pricing.ts`. The popup must use the same formula — not a single fallback rate — otherwise BDT debt totals will silently differ between the popup and the Client List page for the same client.

## Root cause

The dashboard RPC `get_admin_dashboard_summary` returns each client's **total** USD balance but does **not** return per-platform balances. So the popup currently has no way to do the per-platform BDT conversion correctly. It falls back to printing the raw USD number with a wrong "BDT" label.

## Fix

### 1. Extend the RPC to return per-platform balances

In `get_admin_dashboard_summary` (latest migration), the `client_balances` CTE only sums to a single `balance`. Add a sibling JSONB aggregation `platform_balances` keyed by platform:

```text
clients: [{
  user_id, full_name, email, business_name, pricing_config,
  balance,                     // total USD (unchanged)
  platform_balances: {         // NEW
    meta: -3.21,
    tiktok: 0,
    google: 1.10
  }
}]
```

### 2. Pipe the new field through the hook

`useAdminDashboardData.ts`: add `platform_balances` to the typed `ClientWithBalance` shape and to the mapping function.

`QuickActions.tsx` and `ClientSearchCommand.tsx`: widen the `ClientItem` interface to include `pricing_config` and `platform_balances`.

### 3. Render per the canonical rule in the popup

In `ClientSearchCommand.tsx`, replace the current single "BDT" block with the same logic ClientList uses, importing `getPlatformRates` from `@/lib/pricing`:

```text
if balance >= 0:
   render  $X.XX            (success color, USD)
else:
   rates  = getPlatformRates(client.pricing_config)
   bdtDue = Σ p in [meta,tiktok,google]:
              max(0, -client.platform_balances[p]) * rates[p]
   render  −৳Y.YY            (destructive color, BDT)
```

Sorting in the "Top Balances" / "Needs Attention" groups stays based on the USD `balance` field — the magnitude ordering is identical, no behaviour change there.

That's the entire fix. No animation changes, no realtime changes, no new tooltips, no extra widgets. Just bring this one popup in line with how every other balance is displayed across the platform.

## Files touched

- `supabase/migrations/<new>.sql` — extend `get_admin_dashboard_summary` to also emit `platform_balances` per client.
- `src/hooks/useAdminDashboardData.ts` — surface `platform_balances` in the typed result.
- `src/components/dashboard/QuickActions.tsx` — widen `ClientItem` type.
- `src/components/dashboard/ClientSearchCommand.tsx` — use the USD-for-credit / BDT-for-debt rule via `getPlatformRates`.

## Out of scope

- No change to dashboard KPI cards (already correct).
- No change to ClientList, ClientDashboard, or any other consumer.
- No change to realtime subscriptions, sort order, or animations.
