

# Display Live Billing & Payment Info (Like Meta's Billing Page)

## What the user wants
A clean billing summary section on the Ad Account Detail page that mirrors the Meta Ads billing page screenshot — showing **Outstanding Balance**, and a **"You'll pay when"** section with threshold amount and next billing date, all pulled live from the platform API.

## Current state
- The `sync-billing-data` edge function already fetches `current_threshold_spend`, `threshold_limit`, `next_billing_date`, and `account_spending_limit` from Meta's API
- The Billing tab already shows threshold usage and next billing date, but in a generic dashboard style — not matching the clean Meta billing layout the user wants

## Changes

### 1. Add `amount_spent` (Outstanding Balance) to the edge function

The Meta API already returns `amount_spent` in the `adspaymentcycle` response (current cycle spend), which maps to the "Outstanding balance" in the screenshot. We already store this as `current_threshold_spend`. No schema change needed — we just need to ensure the UI displays it as "Outstanding balance."

### 2. Redesign the Billing tab UI in `src/pages/AdAccountDetail.tsx`

Replace the current Billing tab content (lines 484-562) with a layout matching the Meta screenshot:

**Card 1 — Outstanding Balance**
- Large heading: "Outstanding balance"
- Big dollar amount: `$X.XX` (from `current_threshold_spend`)
- Subtitle: "No payment due at this time" if balance is $0, or "Payment pending" if > 0

**Card 2 — "You'll pay when"**
- Two side-by-side info blocks:
  - Left: dollar icon + "Your balance reaches" + threshold amount (from `threshold_limit`)
  - Right: calendar icon + "And on this date" + formatted date (from `next_billing_date`)

**Keep existing**: Sync button, notification list, and threshold progress bar below the new cards.

### 3. Show billing summary for ALL billing types (not just threshold)

Currently the billing tab says "This is a prepaid account" for prepaid accounts. After syncing, even prepaid accounts may have spending limit data worth showing. Update to show the Account Spending Limit for prepaid accounts too.

### Files to modify
- `supabase/functions/sync-billing-data/index.ts` — no changes needed, data already collected
- `src/pages/AdAccountDetail.tsx` — redesign Billing tab UI to match Meta's billing page style

