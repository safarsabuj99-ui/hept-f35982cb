1. Create a single source of truth for wallet balance
- Add a shared utility/hook that computes client balances only from completed transactions.
- Standardize three outputs from the same source: total USD balance, per-platform USD balances, and BDT debt for negative balances.
- Reuse the same known platform handling everywhere so Meta/TikTok/Google and untagged rows are treated consistently.

2. Replace the client list’s custom balance pipeline
- Refactor `/admin/clients` so it no longer maintains its own separate balance math beside the dashboard RPC.
- Either consume the existing admin dashboard summary data directly or make its local aggregation use the new shared balance utility.
- Remove the current drift-prone split where the page computes balances one way, while the client dashboard and search popup use another path.

3. Fix inconsistent status filtering across screens
- Update any screens still reading all transactions for balance purposes to explicitly use completed transactions only.
- Align these pages/components with the same rule:
  - Client wallet
  - Client detail-related balance views/utilities
  - Manager dashboard
  - Runway/automation balance widgets
  - Platform transfer pre-balance checks
- This prevents future bugs when pending/rejected rows appear again.

4. Normalize positive vs negative display rules
- Keep positive balances in USD.
- Keep negative balances displayed as BDT debt using per-platform rates.
- Make list rows, global search, and client-facing wallet/dashboard all rely on the same BDT debt helper so the same client cannot show different due values in different places.

5. Harden realtime refresh behavior
- Ensure all balance-driven views refresh off the same transaction events and do not hold stale locally derived totals.
- Review the client list and related views for any subscriptions pointing at the wrong spend table or missing the canonical balance source.

6. Verify against live backend data
- Compare a sample of real clients between:
  - transactions table aggregate
  - admin client list
  - client dashboard/wallet view
  - global search popup
- Confirm the same balance appears everywhere for the same client after the refactor.

Technical details
- Root cause found: the project has multiple independent balance calculators. Some screens correctly filter `transactions.status = 'completed'`, while others still read broader transaction sets or compute platform totals differently.
- The admin dashboard summary backend function already returns correct completed-transaction balances for the main org. The bug risk is mainly in frontend duplication and inconsistent balance math paths.
- Current live data check showed all transactions are presently completed, which is why the mismatch may look intermittent right now. But the code paths are still inconsistent, so the bug can return as soon as pending/rejected records exist or platform-tag edge cases occur.
- Implementation will focus on prevention, not just a one-off patch.

Expected result
- Client list balance will match the client’s original wallet/dashboard balance.
- Search popup, manager view, and admin widgets will all show the same balance numbers.
- Future pending/rejected deposits will no longer create silent balance mismatches.