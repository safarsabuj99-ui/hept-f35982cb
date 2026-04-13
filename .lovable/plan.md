

## Plan: Fix All Missing org_id Issues Across Edge Functions and Database

### Problems Found

**Data with NULL org_id right now:**
| Table | NULL count | Impact |
|-------|-----------|--------|
| `transactions` | 1 | Balance miscalculation — credit invisible to admin |
| `notifications` | 20 | Notifications invisible to some users |
| `usd_inventory_snapshots` | 1 | Snapshot invisible |
| `audit_logs` | 76 | Audit trail gaps |
| `settings` | 11 | Settings invisible (but may be intentional for global) |
| `profiles` | 1 | Affiliate test user — low risk |

**Root cause — 3 edge functions insert without org_id, and `set_org_id_from_auth()` trigger fails because `auth.uid()` is NULL for service-role calls:**

1. **`approve-payment`** — inserts transactions and audit_logs without `org_id`. The payment request has `org_id` on it, but it's never copied to the transaction records. This is the most dangerous bug — approved deposits become invisible credits, inflating or deflating balances.

2. **`platform-transfer`** — inserts 2 transactions (debit + credit) and audit_log without `org_id`. Same problem — transfer records become invisible.

3. **`auto-snapshot-usd`** — upserts `usd_inventory_snapshots` without `org_id`. Uses service role, so the auth trigger fails.

### Fix — Two Parts

#### Part 1: Harden the `set_org_id_from_auth` trigger (transactions table)
Replace it with a smarter fallback trigger that:
- First tries `auth.uid()` (for browser-initiated inserts)
- Falls back to looking up `org_id` from the `profiles` table using `NEW.client_id`
- This catches ALL edge function inserts automatically — no need to modify every function

Also add the same fallback pattern to `usd_inventory_snapshots` and `audit_logs`.

#### Part 2: Backfill existing NULL records
- 1 transaction: set org_id from client's profile
- 20 notifications: set org_id from user's profile
- 1 usd_inventory_snapshot: set to primary agency org_id
- 76 audit_logs: set org_id from user's profile

#### Part 3: Explicitly add org_id in edge functions (belt-and-suspenders)
- **`approve-payment`**: Copy `pr.org_id` into each transaction and audit_log insert
- **`platform-transfer`**: Look up client's org_id and include in transaction + audit_log inserts
- **`auto-snapshot-usd`**: Look up org_id and include in snapshot upsert

### Files Changed
| Action | File |
|--------|------|
| Migration | Replace `set_org_id_from_auth` trigger with smart fallback on `transactions`, `usd_inventory_snapshots`, `audit_logs` + backfill NULLs |
| Modify | `supabase/functions/approve-payment/index.ts` — add `org_id` to transactions and audit_logs |
| Modify | `supabase/functions/platform-transfer/index.ts` — add `org_id` to transactions and audit_logs |
| Modify | `supabase/functions/auto-snapshot-usd/index.ts` — add `org_id` to snapshot upsert |

### Why This Prevents Future Bugs
The upgraded trigger uses a cascading lookup (`auth.uid()` → `client_id` profile → hardcoded fallback`), so even if a developer forgets to add `org_id` in a new edge function, the trigger will resolve it automatically. The explicit edge function changes are defense-in-depth.

