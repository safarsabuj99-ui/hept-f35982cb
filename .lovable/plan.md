

## Plan: Implement 10 SaaS Management Features

### What Already Exists
- Plans/pricing (`platform_plans`), subscriptions (`organization_subscriptions`), invoices (`platform_invoices`)
- Manual payment proof upload (bKash/Nagad), payment verification workflow
- Usage metering page (clients/accounts/managers vs limits)
- MRR/ARR revenue dashboard with basic metrics
- Subscription lifecycle worker (reminders, invoice generation, overdue marking, suspension)
- Tenant lifecycle Kanban, cohort analysis, churn prediction, health scores

---

### Feature 1: Automated Payment Gateway (SSLCommerz)

Since the platform targets Bangladeshi agencies, SSLCommerz is the right fit (Stripe is not available in Bangladesh for local BDT transactions).

**Database migration:**
- New table `payment_gateway_config`: `id`, `org_id` (nullable, null = platform-level), `gateway` (enum: sslcommerz, stripe, manual), `is_active`, `config` (JSONB - store IDs, not secrets), `created_at`
- New table `gateway_transactions`: `id`, `org_id`, `subscription_id`, `invoice_id`, `gateway`, `gateway_txn_id`, `amount_bdt`, `status` (initiated/success/failed/cancelled), `gateway_response` (JSONB), `created_at`
- Add `auto_renew` boolean to `organization_subscriptions` (default false)

**Edge function: `payment-gateway`**
- POST handler with actions: `initiate` (creates SSLCommerz session, returns redirect URL), `ipn` (IPN callback - validates, updates gateway_transactions, marks invoice paid, updates subscription)
- On successful payment: update `organization_subscriptions.payment_status = 'paid'`, extend period, generate next invoice
- Store SSLCommerz Store ID and Store Password as secrets

**Edge function: `auto-renew-subscriptions`**
- Daily cron: find subscriptions with `auto_renew = true` and `current_period_end` within 3 days
- Initiate gateway charge or send payment link notification

**Frontend changes:**
- `AdminSubscription.tsx`: Add "Pay Now" button that calls `payment-gateway` edge function and redirects to SSLCommerz
- New `src/pages/PaymentSuccess.tsx` and `PaymentFailed.tsx`: callback pages after gateway redirect
- `PlatformBilling.tsx`: Show gateway transactions tab alongside manual verifications
- Add routes in `App.tsx`

---

### Feature 2: Usage Metering & Overage Billing

**Database migration:**
- New table `usage_metering_logs`: `id`, `org_id`, `metric_type` (enum: api_calls, storage_mb, sync_runs, ad_accounts, clients, managers), `value` (numeric), `recorded_at` (timestamptz), `billing_period` (date)
- New table `overage_charges`: `id`, `org_id`, `invoice_id`, `metric_type`, `included_limit`, `actual_usage`, `overage_units`, `rate_per_unit_bdt`, `total_bdt`, `billing_period`, `created_at`
- Add columns to `platform_plans`: `api_call_limit` (int, default 10000), `storage_limit_mb` (int, default 500), `sync_run_limit` (int, default 100), `overage_rate_bdt` (JSONB with per-metric rates)

**Edge function: `meter-usage`**
- Called by sync-orchestrator, sync-fast-lane, sync-deep-dive after each run to log usage
- Also callable via POST to manually log API calls
- Aggregates daily usage per org per metric

**Edge function update: `subscription-lifecycle`**
- Before generating invoice, calculate overages from `usage_metering_logs`
- Create `overage_charges` rows and add overage amount to invoice total

**Frontend changes:**
- Update `TenantUsageMetering.tsx`: Add API calls, storage, sync runs columns with progress bars; add overage history table
- `AdminSubscription.tsx`: Show current period usage breakdown with "X of Y used" for each metered resource
- `AgencyDetail.tsx`: Add usage tab showing historical metering data

---

### Feature 3: Self-Service Plan Changes

**Database migration:**
- New table `plan_change_log`: `id`, `org_id`, `from_plan`, `to_plan`, `from_cycle`, `to_cycle`, `proration_credit_bdt`, `proration_charge_bdt`, `effective_date`, `status` (pending/completed/cancelled), `created_at`
- Add `allow_self_upgrade` boolean to `platform_plans` (default true)
- Add `allow_self_downgrade` boolean to `platform_plans` (default false)

**Edge function: `change-plan`**
- Input: `org_id`, `new_plan_key`, `new_billing_cycle`
- Calculates proration: remaining days on current plan as credit, charge for new plan from today
- If upgrade: apply immediately, update `organizations` (plan, limits, features), create new subscription record, log to `plan_change_log`
- If downgrade: schedule for end of current period, set `pending_downgrade` on subscription
- Generate adjustment invoice (credit note or charge)
- Validate resource limits (don't allow downgrade if current usage exceeds new plan limits)

**Frontend changes:**
- `AdminSubscription.tsx`: Add "Change Plan" section with plan comparison cards
  - Show current plan highlighted, other plans with "Upgrade" or "Downgrade" buttons
  - Proration preview dialog showing credit/charge calculation before confirming
  - Downgrade warning if current usage exceeds target plan limits
- Add cancellation flow: "Cancel Subscription" button with retention dialog (discount offer, pause option, feedback survey)
- Store cancellation reason in `plan_change_log`

---

### Feature 4: Customer Communication (Automated Emails)

**Email infrastructure setup** using the email scaffolding tools.

**Database migration:**
- New table `email_templates`: `id`, `key` (unique, e.g. 'welcome', 'trial_expiring', 'payment_failed'), `subject_en`, `subject_bn`, `body_html`, `body_text`, `variables` (JSONB array of placeholder names), `is_active`, `created_at`
- New table `email_log`: `id`, `org_id`, `user_id`, `template_key`, `to_email`, `subject`, `status` (queued/sent/failed/bounced), `sent_at`, `error`, `created_at`
- New table `email_schedules`: `id`, `template_key`, `trigger_type` (event/cron), `trigger_config` (JSONB), `is_active`, `created_at`

**Edge function: `send-email`**
- Generic email sender using the platform's email infrastructure
- Accepts template_key, org_id, user_id, variables
- Resolves template, substitutes variables, sends via configured provider
- Logs to `email_log`

**Edge function update: `subscription-lifecycle`**
- After generating reminders as notifications, also trigger email via `send-email`
- Email triggers: welcome (on signup), trial_expiring (7 days, 3 days, 1 day), payment_received, payment_failed, invoice_generated, subscription_suspended, subscription_renewed

**Frontend changes:**
- New page `src/pages/PlatformEmailTemplates.tsx`: CRUD for email templates with variable preview, enable/disable toggle
- New page `src/pages/PlatformEmailLog.tsx`: Searchable/filterable log of all sent emails with status badges
- Add route and nav links in `PlatformLayout.tsx`
- `AgencyDetail.tsx`: Add "Email History" tab showing emails sent to that agency

---

### Feature 5: Revenue Recovery (Dunning Management)

**Database migration:**
- New table `dunning_schedules`: `id`, `name`, `steps` (JSONB array: `[{day: 1, action: 'email', template: 'payment_reminder_1'}, {day: 3, action: 'email', template: 'payment_reminder_2'}, {day: 7, action: 'restrict'}, {day: 14, action: 'suspend'}]`), `is_default`, `created_at`
- New table `dunning_runs`: `id`, `org_id`, `subscription_id`, `invoice_id`, `schedule_id`, `current_step` (int), `started_at`, `last_action_at`, `status` (active/recovered/exhausted/cancelled), `recovery_amount_bdt`, `created_at`
- Seed a default dunning schedule on migration

**Edge function: `dunning-processor`**
- Daily cron job
- Find all `dunning_runs` with status='active'
- For each: check current_step, check if enough days passed for next step
- Execute step action: send email (via `send-email`), restrict features (update `organizations.allowed_features`), suspend org
- If payment received (check `subscription_payments`), mark as 'recovered' and restore access
- Auto-create `dunning_runs` for new overdue subscriptions

**Frontend changes:**
- New page `src/pages/PlatformDunning.tsx`:
  - KPIs: Total overdue amount, recovery rate, active dunning runs, average recovery time
  - Dunning pipeline table: org name, overdue since, current step, next action date, amount
  - Quick actions: pause dunning, skip step, mark as recovered, write off
- Dunning schedule editor: drag-and-drop steps (email, restrict, suspend, write-off)
- Add to `PlatformLayout.tsx` nav under Billing section
- `AgencyDetail.tsx`: Show dunning status badge and history if applicable

---

### Feature 6: Financial Reporting (MRR Waterfall, LTV/CAC)

**Database migration:**
- Add columns to `mrr_snapshots`: `reactivation_mrr` (numeric, default 0), `upgrade_mrr` (numeric, default 0), `downgrade_mrr` (numeric, default 0)
- New table `acquisition_costs`: `id`, `org_id`, `cost_type` (enum: marketing, sales, onboarding, referral), `amount_bdt`, `description`, `date`, `created_at`

**Edge function update: `snapshot-mrr`**
- Enhanced MRR categorization: New (first subscription), Expansion (upgrade), Contraction (downgrade), Reactivation (re-subscribe), Churned (cancelled/suspended)
- Calculate per-org LTV: total revenue from org / months active
- Store enhanced breakdown in `mrr_snapshots`

**Frontend changes:**
- Update `PlatformRevenue.tsx`:
  - Add MRR Waterfall chart (stacked bar): Starting MRR + New + Expansion + Reactivation - Contraction - Churn = Ending MRR
  - Add LTV/CAC section: Average LTV, Average CAC (from `acquisition_costs`), LTV:CAC ratio gauge
  - Add Revenue Recognition table: monthly accrued vs collected revenue
  - Add cohort revenue heatmap (revenue per signup month over time)
- New `src/pages/PlatformFinancialReports.tsx`:
  - Downloadable reports: Monthly P&L, Revenue by plan, Aging receivables
  - Date range filters, export to CSV
  - Add route in `App.tsx` and nav in `PlatformLayout.tsx`

---

### Feature 7: Multi-Currency Support

**Database migration:**
- New table `currency_rates`: `id`, `from_currency` (text), `to_currency` (text), `rate` (numeric), `source` (manual/api), `updated_at`, `created_at`
- Add `currency` column to `platform_plans` (text, default 'BDT')
- Add `billing_currency` to `organization_subscriptions` (text, default 'BDT')
- Add `currency` to `platform_invoices` (text, default 'BDT')
- Seed BDT/USD rate from existing settings table

**Edge function: `sync-currency-rates`**
- Optional daily cron: fetch latest BDT/USD rate from a free API (e.g., exchangerate-api)
- Update `currency_rates` table
- Fallback to manual rates if API unavailable

**Frontend changes:**
- `PlatformPlans.tsx`: Add currency selector when creating/editing plans (BDT or USD pricing)
- `AdminSubscription.tsx`: Show prices in org's billing currency with conversion tooltip
- `PlatformBilling.tsx`: Currency column on invoices, conversion rate display
- New `src/pages/PlatformCurrencyRates.tsx`: Manage exchange rates, view rate history
- Update invoice generation in `subscription-lifecycle` to use org's billing currency

---

### Feature 8: Referral / Affiliate Program

**Database migration:**
- New table `referral_program`: `id`, `name`, `commission_type` (enum: percentage, fixed_amount), `commission_value` (numeric), `min_months` (int, default 1 — referred agency must stay X months), `max_payouts` (int, nullable — cap per referrer), `is_active`, `created_at`
- New table `referral_codes`: `id`, `org_id` (referrer), `code` (unique text), `program_id`, `uses_count` (int, default 0), `is_active`, `created_at`
- New table `referral_tracking`: `id`, `referral_code_id`, `referred_org_id`, `referrer_org_id`, `status` (enum: pending, qualified, paid, expired), `qualified_at`, `commission_bdt`, `paid_at`, `created_at`
- Add `referred_by_code` to `organizations` (text, nullable)

**Edge function: `referral-commission`**
- Monthly cron: check `referral_tracking` where status = 'pending'
- If referred org has been active and paying for `min_months`, mark as 'qualified'
- Calculate commission based on program rules
- Create notification for referrer about earned commission
- Platform owner approves payouts manually

**Frontend changes:**
- New `src/pages/PlatformReferrals.tsx` (platform owner):
  - Program configuration (commission %, minimum months, caps)
  - Referral tracking table: referrer, referred, status, commission, payout status
  - KPIs: total referrals, conversion rate, total commissions, pending payouts
  - Approve/pay commission actions
- `AdminSubscription.tsx`: Add "Referral Program" card
  - Show referral code (auto-generated), copy button
  - Share link: `{domain}/signup?ref={code}`
  - Track referred agencies and earned commissions
- Update `Signup.tsx`: Accept `ref` query param, store in `organizations.referred_by_code`, create `referral_tracking` row
- Add routes and nav links

---

### Feature 9: SLA & Support Tiers

**Database migration:**
- New table `support_tiers`: `id`, `plan_key` (text), `priority_level` (enum: standard, priority, dedicated), `response_time_hours` (int), `resolution_time_hours` (int), `channels` (JSONB array: ['email', 'chat', 'phone']), `dedicated_manager` (boolean), `created_at`
- New table `support_tickets`: `id`, `org_id`, `user_id`, `subject`, `description`, `priority` (enum: low, medium, high, urgent), `status` (enum: open, in_progress, waiting, resolved, closed), `assigned_to` (uuid, nullable), `tier_id`, `first_response_at`, `resolved_at`, `sla_breached` (boolean, default false), `created_at`, `updated_at`
- New table `ticket_messages`: `id`, `ticket_id`, `user_id`, `message`, `is_internal` (boolean), `attachments` (JSONB), `created_at`
- New table `sla_metrics`: `id`, `org_id`, `month` (date), `tickets_total`, `tickets_resolved`, `avg_response_hours`, `avg_resolution_hours`, `sla_breach_count`, `satisfaction_score` (numeric), `created_at`
- Seed default support tiers for Starter/Growth/Pro
- Enable realtime on `support_tickets` and `ticket_messages`

**Edge function: `sla-monitor`**
- Hourly cron: check open tickets against SLA thresholds
- If response_time exceeded and no first_response_at, mark `sla_breached = true`, send urgent notification
- Monthly: aggregate metrics into `sla_metrics`

**Frontend changes:**
- New `src/pages/PlatformSupport.tsx` (platform owner):
  - Ticket queue with filters (status, priority, org, SLA status)
  - Ticket detail view with message thread, internal notes, assignment
  - SLA dashboard: response time gauge, resolution time gauge, breach count
  - Support tier configuration editor
- New `src/pages/AgencySupport.tsx` (agency admin):
  - "New Ticket" form: subject, description, priority, attachments
  - My tickets list with status tracking
  - SLA info card showing their tier benefits
- `AgencyDetail.tsx`: Add support history tab, SLA metrics
- Add routes in `App.tsx`, nav in `PlatformLayout.tsx` and `AdminLayout.tsx`

---

### Feature 10: Legal & Compliance

**Database migration:**
- New table `legal_documents`: `id`, `type` (enum: tos, privacy_policy, dpa, sla_agreement, acceptable_use), `version` (text), `title`, `content_html` (text), `is_current` (boolean), `effective_date` (date), `created_at`
- New table `document_acceptances`: `id`, `org_id`, `user_id`, `document_id`, `accepted_at`, `ip_address` (text), `user_agent` (text)
- New table `data_export_requests`: `id`, `org_id`, `requested_by`, `status` (enum: pending, processing, ready, downloaded, expired), `export_url` (text, nullable), `expires_at` (timestamptz), `created_at`
- RLS: orgs can only see their own acceptances and export requests; platform owner sees all

**Edge function: `data-export`**
- Input: `org_id`
- Collects all org data: profiles, ad_accounts, campaigns, transactions, payment_requests, daily_metrics (limited to org's campaigns)
- Generates JSON archive, uploads to a private storage bucket `data-exports`
- Updates `data_export_requests` with signed URL (expires in 48 hours)
- Sends notification when ready

**Frontend changes:**
- New `src/pages/PlatformLegal.tsx` (platform owner):
  - Document manager: create/edit legal documents with rich text editor
  - Version history with diff view
  - Acceptance tracking table: which orgs accepted which version, when
  - Compliance dashboard: orgs with outdated acceptances, unsigned documents
- New `src/pages/PlatformDataExports.tsx`:
  - Export request queue with status tracking
  - One-click "Export All Data" per agency
  - Auto-expire old exports
- `AdminSubscription.tsx` (agency side):
  - "Legal Documents" section showing current ToS, Privacy Policy
  - Accept/re-accept buttons with timestamp logging
  - "Request Data Export" button (GDPR)
- `Signup.tsx`: Add ToS/Privacy Policy checkbox with link to current documents, store acceptance on signup
- Login gate: if current legal docs version is newer than user's last acceptance, show acceptance prompt before allowing access
- Add routes and nav links

---

### Navigation Updates

Add to `PlatformLayout.tsx` sidebar:
- Under Billing: "Payment Gateway", "Dunning Management", "Currency Rates"
- Under Analytics: "Financial Reports"
- New section "Communication": "Email Templates", "Email Log"
- New section "Support": "Support Tickets", "SLA Config"
- New section "Compliance": "Legal Documents", "Data Exports", "Referral Program"

Add to `AdminLayout.tsx` sidebar:
- "Support" link under existing nav
- "Legal" info in settings or subscription page

### New Routes in `App.tsx`
- `/platform/payment-gateway` → PlatformPaymentGateway
- `/platform/dunning` → PlatformDunning
- `/platform/email-templates` → PlatformEmailTemplates
- `/platform/email-log` → PlatformEmailLog
- `/platform/financial-reports` → PlatformFinancialReports
- `/platform/currency-rates` → PlatformCurrencyRates
- `/platform/referrals` → PlatformReferrals
- `/platform/support` → PlatformSupport
- `/platform/legal` → PlatformLegal
- `/platform/data-exports` → PlatformDataExports
- `/admin/support` → AgencySupport
- `/payment-success` → PaymentSuccess
- `/payment-failed` → PaymentFailed

### Files Summary
- **~12 new pages**, ~6 new edge functions, ~10 database tables, ~5 edge function updates
- All tables with RLS policies scoped to org_id + platform_owner access
- All new pages lazy-loaded and protected by role

