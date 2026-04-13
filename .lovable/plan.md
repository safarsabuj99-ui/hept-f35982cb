

## Plan: Add org_id Auto-Set Triggers for All Tables Missing Them

### Problem
The screenshot shows `"new row violates row-level security policy for table ad_account_clients"` when assigning an ad account to a client. The admin RLS policy requires `org_id = get_user_org_id(auth.uid())`, but the insert payload has no `org_id` — and there's no trigger to auto-populate it.

This same bug exists across **7 more tables** that have `org_id` columns with org-scoped RLS but no auto-set trigger:

| Table | Insert Source | Will break? |
|-------|--------------|-------------|
| `ad_account_clients` | ClientDetail, AdAccountDetail | **Yes — screenshot** |
| `ad_accounts` | auto-import edge function | Yes (service role) |
| `billing_notifications` | sync-orchestrator edge function | Yes (service role) |
| `campaign_mappings` | sync-deep-dive, sync-fast-lane | Yes (service role) |
| `campaigns` | sync-deep-dive | Yes (service role) |
| `notifications` | 10+ edge functions, 3+ pages | Yes |
| `campaign_requests` | NewCampaignRequest (admin path) | Yes (admin only) |
| `client_notices` | ClientNotices page | Yes |

### Fix — One Migration

Create `BEFORE INSERT` triggers on all 8 tables using a universal fallback strategy:

```text
1. Try auth.uid() → get_user_org_id()     (browser inserts)
2. Try client_id → profiles.org_id         (for tables with client_id)
3. Try ad_account_id → ad_accounts.org_id  (for ad_account_clients, billing_notifications)
4. Try campaign_id → campaigns.org_id      (for campaign_mappings)
5. Try user_id → profiles.org_id           (for notifications)
6. Last resort → first org                 (single-tenant safety)
```

Each table gets a dedicated trigger function with the appropriate fallback chain for its foreign keys.

### Also: Backfill existing NULLs

```sql
-- Backfill any existing NULL org_id rows from parent records
```

### Files Changed
| Action | File |
|--------|------|
| Migration | Add 8 `BEFORE INSERT` trigger functions + triggers + backfill NULLs |

No UI code changes needed — the triggers will auto-populate `org_id` transparently.

