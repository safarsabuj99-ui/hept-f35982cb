

## Plan: Full Data Reset + Delete Niloy & Musa Test Users

### What Gets Deleted

**Time-series & financial data (all clients):**
- `daily_metrics` (808 rows)
- `campaign_performance` (808 rows)
- `daily_ad_spend` (1,309 rows)
- `transactions` (335 rows)
- `campaigns` (68 rows)
- `campaign_mappings` (1,245 rows)
- `payment_requests` (10 rows)
- `billing_notifications` (48 rows)
- `audit_logs` (40 rows)

**Users to delete (Niloy + Musa Test):**
- Niloy (`03aa08dd-3a25-40cc-996e-65753849d8b7`) — profile, role, ad_account_clients entries, auth user
- Musa Test (`11f34fbc-6cea-44c4-b7ed-996b7b6f6a0d`) — profile, role, ad_account_clients entries, auth user

### What Gets Preserved
- All **ad accounts** (structure intact)
- All **API integrations** (tokens intact)
- Admin user (MD SABUJ MIAH), Platform Owner, OPU client
- Organization, platform plans, settings, agency accounts
- OPU's `ad_account_clients` entries (if any)

### Execution Order (single migration)

1. Delete `daily_metrics` (depends on campaigns)
2. Delete `campaign_performance`
3. Delete `daily_ad_spend`
4. Delete `transactions`
5. Delete `campaign_mappings`
6. Delete `campaigns`
7. Delete `payment_requests`
8. Delete `billing_notifications`
9. Delete `audit_logs`
10. Delete `ad_account_clients` for Niloy + Musa only
11. Delete `user_roles` for Niloy + Musa
12. Delete `profiles` for Niloy + Musa
13. Delete auth users for Niloy + Musa (via edge function)

Steps 1-12 use the data insert tool. Step 13 uses the existing `create-client` pattern (admin API call to delete auth users).

### No Code Changes Needed
Ad accounts and integrations stay intact. The system will re-populate data on next sync.

