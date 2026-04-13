

## Plan: Backfill NULL org_id Records to MD SABUJ MIAH Agency

### Problem
After the multi-tenant RLS fix, records with `NULL org_id` are invisible to the agency admin because the policies now require `org_id = get_user_org_id(auth.uid())`. This is why dashboard data (spend, collections, profitability) appears empty — the data exists but is filtered out.

### Affected Tables (NULL org_id counts)
| Table | NULL Records |
|-------|-------------|
| transactions | 483 |
| daily_metrics | 212 |
| campaign_performance | 212 |
| daily_ad_spend | 59 |
| payment_requests | 12 |
| usd_inventory_snapshots | 13 |
| usd_purchases | 10 |
| agency_expenses | 9 |
| campaigns | 8 |
| liquid_fund_entries | 4 |
| ad_account_clients | 1 |
| fund_transfers | 1 |

### Fix
One database migration that updates all NULL `org_id` records to `a1b2c3d4-e5f6-7890-abcd-ef1234567890` (MD SABUJ MIAH Agency) across all 12 tables. Since this is the only active agency and all legacy data belongs to it, this is safe.

### Files Changed
| Action | File |
|--------|------|
| Migration | Backfill NULL org_id across 12 tables |

No code changes needed — the data just needs the correct org assignment.

