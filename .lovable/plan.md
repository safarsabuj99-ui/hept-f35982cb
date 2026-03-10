

## Enrich TikTok Ad Account Import with Real Metadata

### Problem
Currently, TikTok ad accounts are imported with hardcoded values (USD currency, prepaid billing, no balance). The user needs automatic detection of currency, billing type, and balance from TikTok's API.

### Solution
Use two BC-level TikTok API endpoints (which already work without geo-block since they use `bc_id`):

1. **`/bc/advertiser/get/`** — returns advertiser details including `currency`, `name`, `status`, `timezone` for all advertisers under the BC. This replaces the blocked `/advertiser/info/` endpoint.

2. **`/advertiser/balance/get/`** — returns balance and budget info per advertiser under the BC. Fields: `cash_balance`, `grant_balance`, `transfer_balance`.

### Implementation

**File: `supabase/functions/auto-import-accounts/index.ts`**

Replace the current TikTok account building logic (lines 148-157) with:

**Step 2a — Fetch advertiser details via BC endpoint:**
```typescript
const detailUrl = `https://business-api.tiktok.com/open_api/v1.3/bc/advertiser/get/?bc_id=${bcId}&page=1&page_size=100`;
```
Extract: `currency`, `name`, `status` per advertiser. Map currency to "BDT" or "USD".

**Step 2b — Fetch balances via BC endpoint:**
```typescript
const balanceUrl = `https://business-api.tiktok.com/open_api/v1.3/advertiser/balance/get/?bc_id=${bcId}&advertiser_ids=${encodeURIComponent(JSON.stringify(advertiserIds))}`;
```
Extract: `cash_balance`, `grant_balance` per advertiser. Sum as outstanding balance.

**Step 3 — Build enriched accounts:**
- `account_currency`: from advertiser details (BDT or USD)
- `billing_type`: "prepaid" (TikTok default; can be overridden if balance data suggests otherwise)
- `threshold_limit`: null (TikTok doesn't use threshold billing)
- `current_threshold_spend`: mapped from balance data
- `account_name`: real name from API

Both endpoints use `bc_id` so they should bypass the same geo-restriction that blocks `/advertiser/info/`. If either fails, the function falls back to the current behavior (IDs from Step 1 with defaults).

### Fallback Strategy
Wrap each enrichment call in try/catch. If geo-blocked, fall back to current hardcoded defaults so import never breaks.

