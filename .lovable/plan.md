# Full A→Z Clone: This Project (Lovable Cloud / Mumbai) → New Project (External Supabase / Singapore)

Goal: keep **this** Lovable project (Project A) untouched and live. Create a brand-new Lovable project (Project B) and connect it to **your own external Supabase project** in Singapore (`ap-southeast-1`). Copy code, schema, data, auth users, storage, edge functions, secrets, crons, settings — everything — into the new Supabase. Domain stays on A for now; we migrate it later as a separate step.

```text
KEEP:   Project A → Lovable Cloud (Mumbai)        ── unchanged, live on heptbd.com
NEW:    Project B → External Supabase (Singapore) ── your own Supabase account
DOMAIN: heptbd.com                                ── NOT touched in this phase
PROXY:  Cloudflare Worker                         ── stays on A; B calls TikTok directly
```

Why external Supabase: you fully own the project, you pick the region (Singapore avoids India TikTok block), you have full dashboard access, and we can use `pg_dump` / `pg_restore` directly between the two databases — much faster and safer than re-typing migrations.

---

## Phase 0 — You set up the external Supabase project

You do this once in your own Supabase account at supabase.com:
1. Create a new organization (or reuse one).
2. Create a new project named e.g. `hept-sg` in region **Southeast Asia (Singapore) — `ap-southeast-1`**.
3. Save: project URL, anon (publishable) key, **service_role key**, and **database password**.
4. In the new Supabase dashboard → Project Settings → Database → enable **direct connection** (so we can run `pg_dump`/`psql` from the migration host).
5. Enable required extensions in SQL editor: `pg_net`, `pg_cron`, `pgcrypto`, `vault`, `uuid-ossp`, `pg_trgm`.

You hand me the URL + service_role key + DB password when ready (stored as Lovable secrets on Project B in Phase 2).

---

## Phase 1 — Inventory of Project A (read-only, no downtime)

Saved to `/mnt/documents/migration/`:
- Full schema dump from A (tables, RLS, policies, GRANTs, indexes, triggers, sequences, enums, functions) — via Lovable Cloud's allowed read paths + already-known migrations.
- List of every edge function in `supabase/functions/*` and its `verify_jwt` setting from `supabase/config.toml`.
- All `pg_cron` schedules.
- All secret **names** currently on A (values stay with you).
- All storage buckets + `storage.objects` RLS policies + object counts.
- Row counts per table.
- `settings` rows (notably `tiktok_proxy_url`, exchange rate, branding).

Project A is **never modified** — read-only exports only.

---

## Phase 2 — Create Project B in Lovable and connect to your Supabase

1. Create a new Lovable project (`hept-sg`).
2. In Project B → **Connectors → Supabase Integration** → connect to your external Supabase project from Phase 0. (We use the Supabase Integration path, **not** Lovable Cloud, because you want full ownership.)
3. Confirm Project B's `.env`, `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, and `supabase/config.toml` now point at your Singapore project. (These are auto-generated — we never hand-edit them.)
4. Copy every file from A → B using `cross_project--*`:
   - `src/**`, `public/**`, all root configs (`package.json`, `vite.config.ts`, `tailwind.config.ts`, `index.html`, `tsconfig*`, `components.json`, `eslint.config.js`).
   - **All** `supabase/functions/*` directories.
   - `supabase/config.toml` `[functions.*]` blocks verbatim (project_id is auto-rewritten).
   - Memory files under `mem://**`.
5. **Do NOT** copy `src/integrations/supabase/client.ts`, `types.ts`, or `.env` — they must reflect B's Supabase, not A's.

---

## Phase 3 — Schema on your new Supabase

In your Singapore Supabase, in this order (single migration script):
1. Create enums (`app_role`, `platform`, `transaction_type`, `transaction_status`, `payment_method`, …).
2. Create every table — with **GRANTs** (`authenticated`, `service_role`, `anon` only where policies allow), then `ENABLE ROW LEVEL SECURITY`, then all policies, indexes, triggers, sequences.
3. Recreate every database function (security-definer helpers, dashboard RPCs, balance/expense triggers, sync helpers — `has_role`, `get_user_org_id`, `get_admin_dashboard_summary`, `mark_parent_complete`, `claim_sync_jobs`, all `notify_on_*`, `instant_guard_pause`, `trigger_send_push`, etc.).
4. Recreate `pg_cron` schedules. The hardcoded URLs inside `trigger_send_push` and `instant_guard_pause` are rewritten to **your new Supabase** URL + anon key.
5. Run Supabase dashboard linter and fix anything it flags.

(Because you own the Supabase project, this step can use direct `pg_dump --schema-only | psql` from A's database into B's — fastest path. If A's direct connection isn't reachable, we fall back to running the migration script through Lovable on B.)

---

## Phase 4 — Auth users (UUIDs preserved)

1. Export from A: `auth.users`, `auth.identities`, `auth.mfa_factors` via the Supabase admin API.
2. Import into B preserving **UUIDs + emails** — so all `auth.uid()`-based RLS keeps working and every `profiles.user_id` FK still resolves.
3. In B's Supabase dashboard → Authentication → Providers:
   - Email/password with HIBP check on.
   - Google OAuth — same client id/secret as A.
   - Apple if used.
   - Disable anonymous signups.
4. Set Site URL + Redirect URLs to B's preview + `.lovable.app` URL. `heptbd.com` is added later when the domain is migrated.
5. Mirror auth email templates + SMTP.

---

## Phase 5 — Bulk data load (FK-safe order)

Use `pg_dump --data-only --column-inserts` per table (or `COPY` for large ones), in this order:

1. `organizations` → `organization_subscriptions` → `platform_plans`
2. `profiles` → `user_roles` → `manager_permissions`
3. `api_integrations` → `ad_accounts` → `ad_account_clients` → `campaign_mappings` → `campaigns`
4. `daily_metrics`, `daily_ad_spend`, `campaign_performance` (largest — chunk by month)
5. `transactions`, `payment_requests`, `fund_transfers`, `platform_fund_transfers`, `cash_withdrawals`, `cash_withdrawal_returns`
6. `agency_accounts`, `agency_expenses`, `platform_accounts`, `platform_expenses`, `platform_costs`, `acquisition_costs`
7. `liquid_fund_entries`, `liquid_fund_loans`, `liquid_fund_loan_returns`
8. `usd_purchases`, `usd_manual_spends`, `usd_inventory_snapshots`, `cash_flow_snapshots`, `mrr_snapshots`
9. `ai_*` tables, `affiliate_*` tables, `referral_*` tables
10. `notifications`, `notification_preferences`, `notification_user_settings`, `notification_mutes`, `push_subscriptions`
11. `campaign_requests`, `campaign_tasks`, `client_notices`, `platform_announcements`
12. `audit_logs`, `sync_logs`, `sync_jobs`, `sync_account_stats`, `sync_integrity_alerts`, `sync_reconciliation_log`, `deep_dive_backlog`
13. `support_tickets`, `ticket_messages`, `support_tiers`
14. `settings`, `currency_rates`, `legal_documents`, `document_acceptances`, all `email_*`, all `dunning_*`, `gateway_transactions`, `payment_gateway_config`, `platform_payment_gateways`, `subscription_payments`, `plan_change_log`, `plan_upgrade_requests`, `overage_charges`, `platform_invoices`, `feature_usage_events`, `usage_metering_logs`, `data_export_requests`, `billing_notifications`, `tenant_health_scores`, `sla_metrics`, `guard_pause_jobs`.

Then `setval()` every sequence to A's max, and compare row counts A vs B per table.

Important: **temporarily disable** triggers `notify_on_*`, `audit_*`, push trigger, instant_guard_pause during bulk load to avoid spamming notifications / firing pause calls. Re-enable when done.

---

## Phase 6 — Storage buckets + objects

1. Recreate every bucket on B with identical `public` flag, file size limit, mime types.
2. Recreate every `storage.objects` RLS policy.
3. Copy every object A → B preserving path, mime, metadata (deposit proofs, branding logos, push icons, ad creatives, KYC).

---

## Phase 7 — Edge functions + secrets + TikTok direct

1. Functions are already in B from Phase 2 → Lovable deploys them to your Supabase.
2. Re-add **every** secret on B (you re-enter values once via Lovable's `add_secret` flow):
   - Meta tokens (per integration).
   - TikTok: `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, refresh tokens.
   - Google Ads: client id, client secret, developer token, refresh tokens.
   - Google Drive OAuth (multi-instance).
   - Payment gateways (bKash, Nagad, Stripe/Paddle if used).
   - VAPID push keys.
   - Resend / email keys.
   - Any custom webhooks.
3. On B, **remove `tiktok_proxy_url` from `settings`** (or leave empty) so `tiktokBase` falls back to `https://business-api.tiktok.com` → direct calls from Singapore, no proxy, no more 41000 or 546 timeouts.
4. Confirm DB functions `trigger_send_push` + `instant_guard_pause` point at B's project URL (rewritten in Phase 3.5).
5. Keep all crons **disabled** on B until Phase 8 passes.

---

## Phase 8 — Smoke tests on Project B (via its `.lovable.app` URL)

`heptbd.com` is not involved. Test on B's preview URL.

- Log in as admin, manager, client, affiliate, platform owner — sessions work because UUIDs were preserved.
- Trigger `sync-fast-lane` + `sync-deep-dive` for one Meta, one TikTok, one Google account. Expect **no 41000 and no 546** on TikTok. KPI rows land in `daily_metrics`.
- Test deposit + admin approval → wallet balance updates atomically.
- Pause/resume a campaign → `instant_guard_pause` calls **B's** `pause-campaign`.
- Send a push notification → reaches the same browser subscriptions.
- Run `ad-guard-check` manually.
- Open `/admin/dashboard`, `/admin/finance`, `/admin/campaigns`, `/client/dashboard`, `/admin/sync-health` — no console / network errors.
- Compare row counts vs A.

Fix anything that fails. Project A keeps serving real users this whole time.

---

## Phase 9 — Parallel-run period (open-ended)

- Project A stays primary on `heptbd.com`. Real traffic untouched.
- Project B runs in parallel on `*.lovable.app` against your Singapore Supabase.
- Optionally enable B's crons in "shadow" mode so it keeps fetching fresh ad metrics in parallel.
- You verify on your own time. No deadline.

---

## Phase 10 — (Future, separate plan) Domain switch

Reserved for later. When you say "do the domain switch":
- Lower DNS TTL 24h ahead.
- Final delta export of hot tables A → B during a short maintenance window.
- Move `heptbd.com` + `www.heptbd.com` from A to B (and add them in B's Supabase auth Redirect URLs).
- Decommission the Cloudflare Worker proxy.
- Keep A read-only 7 days as rollback.

---

## Hard guarantees

- Project A is **never deleted, never modified** (read-only exports only).
- Nothing skipped: Phase 1 inventory is the checklist — every table, function, policy, trigger, secret name, cron, bucket, object, auth user is ticked on B.
- All `auth.uid()`-based RLS keeps working because UUIDs are preserved.
- Wallet integrity preserved (no concurrent writes on the same rows; B's crons stay paused until Phase 8 passes).
- TikTok proxy removed only on B — A keeps using it.
- You own the new Supabase project end-to-end (dashboard, backups, region).

## What you need to do

1. Approve this plan.
2. Phase 0: create the Singapore Supabase project in your account, send me URL + anon key + service_role key + DB password.
3. Re-enter every secret on B when the `add_secret` prompts appear.
4. Verify on B's `.lovable.app` URL during the parallel-run.
5. Tell me when you want to schedule the domain switch (Phase 10).

## Estimated effort

- Phase 0 (you): ~15 min.
- Phase 1–3: ~0.5 day.
- Phase 4–7: ~1 day (depends on `daily_metrics` size).
- Phase 8: ~2–3 h.
- Phase 9 parallel-run: as long as you want.
- Phase 10 (domain): planned separately, ~30–60 min downtime when you trigger it.
