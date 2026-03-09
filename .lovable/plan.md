

# Data Collection Plan: Mapping-First API Sync + UTC+6 Timezone

## Problem Summary

You need the SaaS to:
1. **Only collect data from API when an ad account has a client assigned AND a mapping keyword set** in `ad_account_clients`
2. **Skip all data collection** if no client mapping with keyword exists
3. **Display all dates aligned with UTC+6 (Asia/Dhaka)** timezone

---

## Current State Analysis

| Component | Current Behavior | Issue |
|-----------|------------------|-------|
| `sync-ad-spend` | Fetches ALL active ad accounts | Collects data even without client mapping |
| `sync-deep-dive` | Uses `ad_account_filter_tag` for filtering, but still fetches all accounts | Collects unmapped campaigns |
| `sync-fast-lane` | Fetches ALL active ad accounts | Collects data even without client mapping |
| Date filters | Uses `new Date().toISOString().split("T")[0]` (UTC) | "Today" is UTC, not Bangladesh time |

---

## Solution Architecture

### Rule: No Mapping = No Data Collection

```text
┌─────────────────────────────────────────────────────────────┐
│                    DATA COLLECTION FLOW                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Query ad_account_clients WHERE mapping_keyword != ''     │
│                         │                                    │
│                         ▼                                    │
│  2. Get unique ad_account_ids from Step 1                    │
│                         │                                    │
│                         ▼                                    │
│  3. Fetch ad_accounts WHERE id IN (mapped_ids)               │
│     AND is_active = true                                     │
│                         │                                    │
│                         ▼                                    │
│  4. For each campaign from API:                              │
│     - Match campaign name against mapping_keyword            │
│     - IF MATCH → Store data with client_id                   │
│     - IF NO MATCH → SKIP (do not store)                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### 1. Edge Functions: Restrict to Mapped Accounts Only

**Files:** `sync-ad-spend/index.ts`, `sync-deep-dive/index.ts`, `sync-fast-lane/index.ts`

**Changes:**

```typescript
// Step 1: Get only ad accounts that have client mappings WITH keywords
const { data: mappedAssignments } = await supabase
  .from("ad_account_clients")
  .select("ad_account_id, client_id, mapping_keyword")
  .neq("mapping_keyword", "");  // MUST have a keyword set

// Step 2: Build the list of eligible account IDs
const mappedAccountIds = [...new Set(mappedAssignments?.map(r => r.ad_account_id) || [])];

if (mappedAccountIds.length === 0) {
  return Response({ message: "No mapped accounts to sync", synced: 0 });
}

// Step 3: Query only those accounts
const { data: accounts } = await supabase
  .from("ad_accounts")
  .select(...)
  .eq("is_active", true)
  .in("id", mappedAccountIds);  // Only mapped accounts
```

**Campaign-Level Filtering:**

```typescript
// For each campaign from API, match against mapping keywords
const keywords = mappedAssignments
  .filter(a => a.ad_account_id === account.id)
  .map(a => ({ client_id: a.client_id, keyword: a.mapping_keyword.toLowerCase() }));

// Skip campaign if it doesn't match ANY keyword
const campaignNameLower = campaignName.toLowerCase();
const match = keywords.find(k => campaignNameLower.includes(k.keyword));

if (!match) {
  // No keyword match → DO NOT collect this campaign's data
  continue;
}

// Match found → assign client_id and store
const clientId = match.client_id;
```

---

### 2. Timezone: Use Asia/Dhaka for All Date Calculations

**Edge Functions:**

```typescript
// Get "today" in Bangladesh timezone
const dhakaDateStr = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Dhaka" }).split(" ")[0];
const endDateStr = dhakaDateStr;  // Use instead of UTC
```

**Frontend (`DateRangeFilter.tsx`, `ClientDateFilter.tsx`):**

```typescript
// Replace utcToday() with:
function localToday(): Date {
  const dhakaStr = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Dhaka" }).split(" ")[0];
  return new Date(dhakaStr + "T00:00:00");
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/sync-ad-spend/index.ts` | Filter accounts by mapping; filter campaigns by keyword; use Asia/Dhaka timezone |
| `supabase/functions/sync-deep-dive/index.ts` | Filter accounts by mapping; filter campaigns by keyword; use Asia/Dhaka timezone |
| `supabase/functions/sync-fast-lane/index.ts` | Filter accounts by mapping; use Asia/Dhaka timezone |
| `src/components/DateRangeFilter.tsx` | Use Asia/Dhaka for "today" calculations |
| `src/components/ClientDateFilter.tsx` | Use Asia/Dhaka for "today" calculations |

---

## Behavior Summary

| Scenario | Result |
|----------|--------|
| Ad account with client + keyword | ✅ Data collected, attributed to client |
| Ad account with client, NO keyword | ❌ No data collected |
| Ad account without client mapping | ❌ No data collected |
| Campaign name matches keyword | ✅ Stored with client_id |
| Campaign name doesn't match any keyword | ❌ Skipped, not stored |
| Yesterday in Bangladesh (UTC+6) | Shows as "Yesterday" in UI |

