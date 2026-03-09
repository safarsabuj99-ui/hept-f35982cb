

# Plan: Fix Client List Balance to Match Client Dashboard

## Problem
The Balance column in the Client List shows a BDT amount for negative balances, but it doesn't match the exact BDT value shown on the client's own dashboard. The calculation methods differ slightly.

## Root Cause
The Client Dashboard computes per-platform balances by explicitly filtering for `meta`, `tiktok`, `google` platforms only, then converts each negative platform balance to BDT. The Client List does a different calculation using all transactions grouped by platform field (including `null` → `"unknown"`), which can produce different per-platform splits.

## Solution
Align the Client List's BDT calculation with the Client Dashboard's exact logic:

### Changes to `src/pages/ClientList.tsx`

1. **Fix per-platform balance calculation** (lines 126-133): Instead of grouping all transactions by their raw `platform` field, only track balances for the three known platforms (`meta`, `tiktok`, `google`), matching how the Client Dashboard does it.

2. **Fix BDT conversion** (lines 136-152): Use the same approach as the Client Dashboard — for each client with a negative total balance, iterate over `["meta", "tiktok", "google"]` only, and for each platform with a negative sub-balance, multiply by that client's `pricing_config.flat_rates[platform]` (fallback 120). This ensures the BDT figure matches exactly what the client sees.

3. **Display both USD and BDT for negative balances** (lines 278-295): Show the USD amount as a secondary line alongside the BDT amount, so admins can see both values — matching the client dashboard which shows USD primary with BDT below.

### Files Modified
- `src/pages/ClientList.tsx`

