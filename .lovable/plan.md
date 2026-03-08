

# Fix: Auto-Deduct Ad Spend from Client Balance

## Problem
Client balance is calculated as `credits - debits` from the `transactions` table across the entire SaaS (5+ files, plus edge functions like ad-guard-check). However, when ad spend is synced into `daily_metrics`, **no corresponding debit transaction is ever created**. So a client can deposit $663, spend $560 on ads, and their balance still shows $663.

## Root Cause
The sync functions (`sync-fast-lane`, `sync-deep-dive`) write spend to `daily_metrics` but never create debit entries in `transactions`. The balance formula `credits - debits` only accounts for manual debits (like platform transfers), not actual ad spend.

## Solution: Database Trigger (Auto-Debit)
Create a PostgreSQL trigger on `daily_metrics` that automatically creates/updates a debit transaction whenever spend is recorded. This fixes ALL balance calculations system-wide — no frontend changes needed.

### Why a trigger vs. changing frontend?
- Balance is computed in 5+ frontend files AND backend edge functions (ad-guard-check)
- A trigger is a single fix that makes ALL existing `credits - debits` calculations correct
- No risk of missing a calculation somewhere

## Changes

### 1. Database Migration: Create trigger function + trigger + backfill

**Trigger function** `auto_debit_on_spend()`:
- Fires AFTER INSERT OR UPDATE on `daily_metrics`
- Looks up `campaign → ad_account → client` via `ad_account_clients` junction table
- Deletes any existing auto-debit for that campaign+date (idempotent)
- Inserts a new debit transaction with `description = 'auto_spend:{campaign_id}:{data_date}'`
- Uses SECURITY DEFINER to bypass RLS

**Backfill**: One-time INSERT to create debit transactions for ALL existing `daily_metrics` rows that don't already have corresponding auto-debit transactions.

### 2. Frontend: Filter auto-spend from transaction history display

**`src/pages/ClientDashboard.tsx`**: Filter out transactions where `description` starts with `auto_spend:` from the visible transaction list (they still count in balance). Show a summary row instead like "Ad Spend (auto-tracked)" with the total.

**`src/pages/ClientDetail.tsx`**: Same filtering on the Transactions tab — hide auto_spend rows or show them with a distinct "Auto" badge so they don't clutter the manual transaction view.

### Data Flow After Fix
```text
Sync Function writes daily_metrics
         ↓ (trigger fires)
auto_debit_on_spend() creates debit in transactions table
         ↓
Balance (credits - debits) now reflects actual spend
         ↓
All dashboards, alerts, ad-guard automatically correct
```

### Files Modified
| File | Change |
|------|--------|
| Database migration | Trigger function + trigger + backfill |
| `src/pages/ClientDashboard.tsx` | Filter auto_spend from transaction history display |
| `src/pages/ClientDetail.tsx` | Filter auto_spend from transactions tab display |

