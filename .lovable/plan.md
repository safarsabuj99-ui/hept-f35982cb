

# Add Inline Editing for Threshold & Next Billing Date on Billing Tab

## Problem
Meta's API doesn't expose `threshold_limit` or `next_billing_date` for credit card accounts. These values need to be manually entered and persisted.

## Solution
Add inline edit capability to the "You'll pay when" section on the Billing tab. Users click an edit icon, enter the value, and save — it persists across syncs.

## Changes

### 1. `src/pages/AdAccountDetail.tsx` — Billing Tab UI
- **Show "You'll pay when" for ALL billing types** (not just `isThreshold`) — remove the `{isThreshold && ...}` guard
- Add edit icons (Pencil) next to threshold amount and next billing date
- On click, switch to inline Input fields for editing
- Add a Save button that updates the DB directly via `supabase.from("ad_accounts").update()`
- Show subtle label: "Set manually" when values exist but weren't from API sync, vs "Synced" when they were
- Add `Pencil` to lucide imports
- Add local state: `editingThreshold`, `editingBillingDate`, `editThresholdVal`, `editBillingDateVal`

### 2. `supabase/functions/sync-billing-data/index.ts` — Preserve manual values
- When building the update payload, do NOT overwrite `threshold_limit` or `next_billing_date` if the API didn't return them
- Read existing values from DB first, and only overwrite if API returned new data
- This ensures manual entries persist across syncs

### Files
| File | Change |
|------|--------|
| `src/pages/AdAccountDetail.tsx` | Show "You'll pay when" for all types, add inline edit for threshold & date |
| `supabase/functions/sync-billing-data/index.ts` | Preserve existing threshold/date values when API doesn't provide them |

