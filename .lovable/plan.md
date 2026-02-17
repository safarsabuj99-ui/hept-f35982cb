

# Platform-Aware Payments + Per-Platform Balance Display

## Overview

Two changes:
1. Add a **platform selector** to the deposit flow so both the client and admin know which platform the payment is for. The admin approval modal already shows rate options -- this just pre-selects the correct one.
2. Show **1 main balance + 3 platform sub-balances** on both the Client Dashboard and the admin's Client Detail view. These sub-balances are calculated from existing transaction data (spend debits already have a `platform` field).

---

## Change 1: Platform Selector on Deposit / Payment Request

### DepositFundsDialog (`src/components/DepositFundsDialog.tsx`)
- Add a **"Platform"** dropdown (Meta, TikTok, Google) as a required field
- Save the selected platform into the `payment_requests` table

### Database: Add `platform` column to `payment_requests`
- New nullable text column `platform` on `payment_requests` (nullable for backward compatibility with old requests)

### PaymentRequests approval page (`src/pages/PaymentRequests.tsx`)
- Show the **platform** in the table (new column)
- In the approval modal, **auto-select** the matching platform rate based on the request's platform
- Still allow admin to override if needed

### approve-payment Edge Function (`supabase/functions/approve-payment/index.ts`)
- Pass the platform through to the `transactions` insert so the credit transaction records which platform it was for

---

## Change 2: Per-Platform Sub-Balances

Balances are calculated from the existing `transactions` table which already has a `platform` column. No new tables needed.

### Client Dashboard (`src/pages/ClientDashboard.tsx`)
- Below the main "Available Balance" card, add 3 small sub-balance cards (Meta, TikTok, Google)
- Each sub-balance = platform credits - platform debits from `transactions` where `platform` matches
- Main balance stays as total credits - total debits (unchanged)

### Client Detail view (`src/pages/ClientDetail.tsx`)
- In the Transactions tab or a new Balance section, show the same 3 platform sub-balances alongside the main balance

---

## Technical Details

### Database Migration
```text
ALTER TABLE payment_requests ADD COLUMN platform text;
```
One column addition, no RLS changes needed (existing policies cover it).

### Files Modified

| File | Change |
|------|--------|
| `src/components/DepositFundsDialog.tsx` | Add platform selector (Meta/TikTok/Google) |
| `src/pages/PaymentRequests.tsx` | Show platform column in table; auto-select rate in approval modal |
| `supabase/functions/approve-payment/index.ts` | Pass platform to transaction insert |
| `src/pages/ClientDashboard.tsx` | Add 3 platform sub-balance cards below main balance |
| `src/pages/ClientDetail.tsx` | Add platform sub-balances display |

