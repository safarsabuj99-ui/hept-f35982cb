

## Delete All Data for "MD SABUJ FOR TEST" Client

**Client**: MD SABUJ FOR TEST (`sabuj@gmail.com`)
**ID**: `f4b28335-4d11-44ae-becd-91ab24b53c14`

### Data Found

| Table | Rows |
|---|---|
| transactions | 3 |
| payment_requests | 1 |
| notifications | 2 |
| audit_logs | 1 |
| daily_metrics | 0 |
| campaigns | 0 |
| daily_ad_spend | 0 |
| campaign_performance | 0 |
| billing_notifications | 0 |

### Deletion Plan

Run DELETE statements (via the insert tool) in this order:

1. `DELETE FROM transactions WHERE client_id = 'f4b28335-...'` (3 rows)
2. `DELETE FROM payment_requests WHERE client_id = 'f4b28335-...'` (1 row)
3. `DELETE FROM notifications WHERE user_id = 'f4b28335-...'` (2 rows)
4. `DELETE FROM audit_logs WHERE user_id = 'f4b28335-...'` (1 row)

The client profile and ad account assignments will remain intact — only transactional/financial data is purged.

