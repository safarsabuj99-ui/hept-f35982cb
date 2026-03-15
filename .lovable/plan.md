

## Plan: Full Data Reset (Preserve Structure)

### What Gets CLEARED (all rows deleted)

| Table | Reason |
|-------|--------|
| `daily_metrics` | Time-series spend/performance data |
| `campaign_performance` | Campaign performance records |
| `daily_ad_spend` | Daily ad spend records |
| `campaigns` | Campaign identity records (will be re-imported) |
| `transactions` | All credits/debits including auto_spend |
| `campaign_mappings` | Campaign-to-client mappings |
| `usd_purchases` | USD purchase history |
| `usd_inventory_snapshots` | Snapshot ledger records |
| `billing_notifications` | Billing alerts |
| `audit_logs` | Activity logs |
| `payment_requests` | Payment request records |
| `campaign_requests` | Campaign order requests |
| `agency_expenses` | Agency expense records |
| `fund_transfers` | Fund transfer records |

### What Gets KEPT (untouched)

| Table | Reason |
|-------|--------|
| `api_integrations` | API tokens & connections |
| `ad_accounts` | Ad account structures |
| `ad_account_clients` | Account-to-client assignments |
| `profiles` | Client/manager profiles |
| `user_roles` | Role assignments |
| `manager_permissions` | Manager permissions |
| `settings` | Global settings |
| `agency_accounts` | Bank/agency accounts |

### Execution

One SQL statement per table using the data insert tool (DELETE operations). Order matters — child tables first to avoid FK issues. The API sync functions will re-populate `campaigns`, `daily_metrics`, `campaign_performance`, and `daily_ad_spend` on the next scheduled run.

### No Code Changes Needed

The frontend and edge functions will work as-is — they'll just show empty/zero states until new data syncs in. The snapshot system will start fresh (no snapshot = calculates from scratch until you set an opening balance).

