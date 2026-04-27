# Make the global client search a real command center

## Goal

Turn the Cmd+K popup from a list-with-balance into a fast operational tool an agency admin can use to: find any client by anything, see who needs action right now, and jump straight to the right page — without ever leaving the keyboard.

## What's there today

- Three sections: Top Balances, Needs Attention, All Clients.
- Search across name / email / business.
- Balance shown with the correct USD/BDT rule (just fixed).

## What's missing (the actual gaps)

1. Search is too narrow — admins also know clients by **phone number**, **mapping keyword**, and **rounded balance**.
2. No status signals — a client whose campaigns are **guard-paused** (5 right now), or who has a **pending payment request**, looks identical to a healthy client.
3. No quick actions — clicking always goes to the client detail page; there's no shortcut to wallet, campaigns, spend, or payment requests.
4. No collection priority — "Needs Attention" lists negatives alphabetically instead of by debt size.
5. No portfolio summary — admin can't see total credit / total debt at a glance.
6. No memory of recent work — frequently-opened clients aren't surfaced.

## The plan — six concrete upgrades

### 1. Multi-field, fuzzy search

Extend the per-row `searchValue` so cmdk can match by:
- name, business, email (existing)
- **phone** (last 4 digits or full)
- **mapping keyword** (e.g. typing `MUSA` matches the mapping)
- **rounded balance** as a string (typing `155` finds the $155 client; typing `1500` finds the ৳1,500 debt)

Requires adding `phone`, `mapping_keyword` to the RPC payload. Search stays fully client-side, so no perf cost.

### 2. Live status badges on each row

Right after the client name, render at most **two** tiny pill badges so urgent state is visible at a glance:

- `Paused` (red) — when `guard_paused_at IS NOT NULL` or `system_paused_campaigns` is non-empty.
- `Pending Pay` (amber) — when the client has 1+ pending payment requests, with the count.
- `Inactive` (gray) — when `is_active = false`.

The RPC already groups admin data; we add three lightweight CTEs to attach `is_paused`, `pending_payments`, `is_active` per client. Same dataset, no extra round-trips.

### 3. Smart sorting in "Needs Attention"

Sort by **BDT debt magnitude descending** (using the per-platform conversion already wired up), so the largest debts surface first — that's what an admin actually wants to chase. Show a header subtitle like `Needs Attention · 6 · ৳12,430 due` with the org-wide debt total computed once.

### 4. Top-of-popup KPI strip

A single thin row above the groups:

```text
[ +$2,143.10 USD credit ]  [ −৳18,420 BDT due ]  [ 5 paused ]  [ 2 pending pay ]
```

Each chip is clickable and routes to the relevant page (wallet inventory, payment requests, attention required). Computed from the `clients` array we already have plus the new status fields — zero new queries.

### 5. Quick-action menu per row (keyboard-driven)

Right side of each row gets a chevron. Pressing `→` (or hovering) reveals four sub-actions on that client:

- `Open dashboard` (default Enter behavior, unchanged)
- `Wallet` → `/admin/clients/:id?tab=wallet`
- `Campaigns` → `/admin/clients/:id?tab=campaigns`
- `Payment requests` → `/admin/payment-requests?client=:id`

Implemented with a nested cmdk view (toggle via state when arrow-right is pressed on a focused row). Pure client-side, ~30 lines.

### 6. "Recent" section + per-user persistence

Track the last 5 clients the admin opened in `localStorage` (key: `hept_recent_clients_<userId>`). Show them as the **first** group above Top Balances when the search input is empty, with a `Clear` action. This makes the popup match how admins actually work — they reopen the same 3–4 clients all day.

## Out of scope (explicit)

- No new realtime channels.
- No new pages or routes.
- No animation or visual redesign — same look, just more useful.
- No changes to AdminDashboard KPIs, ClientList, or any unrelated component.

## Files touched

- `supabase/migrations/<new>.sql` — extend `get_admin_dashboard_summary` to include `phone`, `mapping_keyword`, `is_active`, `is_paused`, `pending_payments` per client.
- `src/hooks/useAdminDashboardData.ts` — type and pass-through the new fields.
- `src/components/dashboard/QuickActions.tsx` — widen `ClientItem` interface.
- `src/components/dashboard/ClientSearchCommand.tsx` — KPI strip, status badges, smart sort, multi-field search, quick-action submenu, recent clients (localStorage).

## Why this matters for an agency

Today the popup answers one question: "where's this client?" After this, it answers four:

1. Where's this client? (search)
2. Who do I owe a callback / collection to right now? (KPI strip + sorted attention)
3. What state are they in? (badges)
4. Take me directly to where I work on them. (quick actions + recents)

That's the difference between a search box and a command center.
