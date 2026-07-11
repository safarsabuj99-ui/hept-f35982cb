## Findings

- The backend is now discovering HEPT Digital partner access: latest function log shows `owned=3, partner=1, system_user=2, merged=4`.
- So the current problem is likely after discovery: slow/blocking enrichment, inconsistent ID dedupe, or imported/existing accounts being skipped/hidden instead of updated/reactivated.

## Plan

1. **Make Meta discovery resilient and complete**
   - Normalize every Meta account ID before dedupe (`123` and `act_123` become the same account).
   - Keep the current three discovery paths:
     - Business owned accounts
     - Business partner/client accounts
     - System User direct `/me/adaccounts`
   - Add a safe fourth fallback for partner-shared business assets where available, without making it fatal if Meta rejects it.

2. **Stop billing enrichment from hiding accounts**
   - Move billing-cycle fetches behind short per-account timeouts.
   - Run enrichment with `Promise.allSettled`, so account discovery returns even if Meta billing/payment-cycle APIs are slow or permission-denied.
   - If billing enrichment fails, still show/import the ad account with default billing fields and add a warning.

3. **Fix import behavior for existing/previously imported accounts**
   - Replace the current simple “skip if existing” logic with smart upsert behavior:
     - If the account is new: create it.
     - If the same org already has the account but it is inactive: reactivate/update it.
     - If the same account exists under a different integration: update `api_integration_id` to the selected HEPT Digital integration.
     - Avoid duplicate rows.
   - Return counts for `created`, `updated/reactivated`, and `skipped`.

4. **Make the preview UI explain what happened**
   - Show ownership source in Fetch Accounts: `Owned`, `Partner`, or `System User`.
   - Show imported status clearly: `New`, `Already active`, `Inactive — can reactivate`.
   - Allow selecting inactive existing accounts so import can reactivate them instead of disabling them forever.
   - Show discovery summary/counts and warnings so partner API failures are visible.

5. **Verify with HEPT Digital**
   - Test the function for the HEPT Digital integration.
   - Confirm the response includes all 4 discovered accounts from the latest log.
   - Confirm import writes/reactivates them in `ad_accounts` and they appear in Active/Inactive tabs correctly.