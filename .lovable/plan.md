

## Plan: Smart Ad Account Import with Selection & Plan Limit Enforcement

### Current Behavior
- Auto-import blindly fetches ALL accounts from selected Business Managers/Centers and inserts them all at once
- The `check_ad_account_limit` DB trigger blocks inserts when the limit is reached, but it's an all-or-nothing failure — no partial import, no user choice
- No visibility into which accounts exist on the platform before importing

### New Behavior
A two-step import flow with a selection popup and plan-aware limits:

```text
Step 1: User clicks "Auto-Import" → selects integration(s) → clicks "Fetch"
Step 2: Edge function returns discovered accounts → shown in a popup table
        with checkboxes. Accounts already imported are shown as disabled/greyed.
        A limit banner shows: "You can add X more ad accounts (Y/Z used)"
Step 3: User selects which accounts to import (capped at remaining quota)
Step 4: Only selected accounts are sent to the edge function for insertion
```

### Implementation

#### 1. Modify Edge Function (`auto-import-accounts/index.ts`)
Add a `preview` mode parameter:
- When `{ preview: true }`, fetch accounts from platforms but do NOT insert — just return the discovered list
- When `{ preview: false, selected_accounts: [...] }`, insert only the selected accounts
- Return org limit info (`max_ad_accounts`, current count) in both responses

#### 2. Redesign Import Dialog (`src/pages/AdAccounts.tsx`)
Replace the current simple dialog with a two-phase flow:
- **Phase 1**: Select integrations → "Fetch Accounts" button
- **Phase 2**: Show discovered accounts in a scrollable table with:
  - Checkbox per account (disabled for already-imported ones)
  - Platform badge, Account Name, Account ID, Currency, Billing Type
  - Limit indicator: "X of Y ad accounts used — can add Z more"
  - Selection count vs remaining quota warning
  - "Import Selected" button (disabled if over quota)
- The dialog enforces the limit client-side AND server-side (DB trigger still acts as final guard)

#### 3. No schema changes needed
- `organizations.max_ad_accounts` already exists and is enforced by the `check_ad_account_limit` trigger
- `organizations.max_clients` already enforced by `check_client_limit` trigger
- No new columns or tables required

### Files Changed
| Action | File |
|--------|------|
| Modify | `supabase/functions/auto-import-accounts/index.ts` — add preview mode, return limits |
| Modify | `src/pages/AdAccounts.tsx` — two-phase import dialog with account selection and limit display |

### Plan Limit Enforcement Summary
- **Ad accounts**: Enforced at DB trigger level + UI shows remaining quota in import dialog
- **Clients**: Already enforced at DB trigger level on profile insert
- **Integrations**: No explicit limit column exists — if needed we can add `max_integrations` to `organizations` and `platform_plans`, but this is optional and not requested

### Safety
- DB trigger remains the final enforcement — even if UI math is wrong, the insert will be blocked
- Existing accounts are deduplicated by `platform:account_id` key
- No changes to RLS policies

