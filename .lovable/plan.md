## Plan: make refund fully workable

### What I verified
- The client detail route is using the client auth/user id: `9e2fa8d9-4116-44cf-9876-eeef931570cc`.
- This client’s real completed wallet balance in the database is positive: about `$93.22`.
- The refund popup is opened from `ClientDetail` with `profile.id` instead of `profile.user_id`.
- For MUSA, `profile.id` has `0` wallet/payment rows, but `profile.user_id` has the wallet transactions and `78` payment rows.
- That explains both symptoms:
  - available refund balance shows `$0.00`
  - rate falls back to default `৳120` instead of the last payment rate

### Fix
1. **Correct the client id passed to refund popup**
   - Update the Client Detail refund button/dialog to pass `profile.user_id` as the refund client id.
   - Keep `profile.id` only as profile metadata, not as the transaction/payment lookup key.

2. **Harden `RefundDialog` so this bug cannot repeat easily**
   - Add a defensive resolver inside the dialog:
     - first try the provided client id
     - if no wallet/payment data is found, check whether it is a profile row id and resolve it to `profiles.user_id`
   - Use the resolved wallet client id for:
     - transactions balance
     - last payment lookup
     - refund transaction insert
     - refund audit row

3. **Use the same wallet calculation as Main Balance**
   - Keep `fetchAllRows` pagination for all completed transactions.
   - Continue using `computeWalletBalance()` as the single wallet source.
   - This makes refund available balance match the Transactions tab main balance.

4. **Fix last payment exchange rate detection**
   - After client id is resolved correctly, read the latest approved/refunded payment.
   - Derive refund rate from the latest deposit in this order:
     1. effective payment rate: `amount_bdt / final_amount_usd` when available, preserving MFS/cash/bank fee behavior
     2. payment `exchange_rate_snapshot` if final USD is unavailable
     3. latest completed credit transaction `exchange_rate`
     4. default `৳120` only if no payment/credit history exists
   - Show the source clearly in the popup.

5. **Validation**
   - Verify MUSA’s popup shows positive available refund balance instead of `$0.00`.
   - Verify rate shows the latest payment-derived rate instead of default `৳120`.
   - Verify refund submission creates a debit on the correct client wallet and refreshes the main balance.