

# Multi-Client Ad Account Assignment with Keyword-Based Mapping

## Overview

Currently, each ad account can only have **one client** assigned (single `client_id` column). You want **multiple clients** on the same ad account, each with their own mapping keyword so campaigns are correctly attributed. RLS ensures each client only sees their own spend data.

## Database Changes

### 1. New Junction Table: `ad_account_clients`

A many-to-many link between ad accounts and clients, with a per-assignment mapping keyword.

```text
ad_account_clients
--------------------------------------
id              uuid (PK)
ad_account_id   uuid (FK -> ad_accounts.id)
client_id       uuid (not null)
mapping_keyword text (not null)
created_at      timestamptz
UNIQUE(ad_account_id, client_id)
```

RLS policies:
- Admins: full access
- Managers: read for their managed clients
- Clients: read their own assignments

### 2. Remove `client_id` from `ad_accounts`

The single-client column becomes obsolete. We drop it after migrating any existing assignments into the new junction table.

## UI Changes

### 3. Ad Accounts Page (`AdAccounts.tsx`)

Replace the single client dropdown with a multi-client management UI:
- Show assigned clients as a list of badges/chips under each ad account row
- "Add Client" button opens a small popover/dialog to pick a client and enter a mapping keyword
- Each assignment chip shows the client name and keyword, with an X to remove
- No limit on how many clients can be assigned

### 4. Campaign Mapping Page (`CampaignMapping.tsx`)

No major changes needed -- campaigns are already individually assignable to clients. The sync process will handle auto-assignment using the new per-account keywords.

## Sync Logic Changes

### 5. Update `sync-ad-spend/index.ts`

Instead of reading `account.client_id`, the sync function will:
- Query `ad_account_clients` for all client assignments for each account
- For each campaign, match the campaign name against the `mapping_keyword` from the junction table
- If a keyword matches, assign that `client_id` to the spend record
- Fall back to the profile-level `mapping_keyword` if no junction match is found

## Data Isolation (RLS)

The existing RLS on `daily_ad_spend`, `campaign_mappings`, and other tables already filters by `client_id` on each row. Since the sync writes the correct `client_id` per campaign based on keyword matching, each client only sees their own data. No RLS changes needed on those tables.

## Technical Summary

| Change | File / Location |
|--------|----------------|
| Create `ad_account_clients` table + RLS | Database migration |
| Migrate existing `ad_accounts.client_id` data | Database migration |
| Drop `client_id` from `ad_accounts` | Database migration |
| Multi-client assignment UI | `src/pages/AdAccounts.tsx` |
| Update sync to use junction table keywords | `supabase/functions/sync-ad-spend/index.ts` |

