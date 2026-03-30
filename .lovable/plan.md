

# Plan: Multi-Campaign Request Builder (Revised)

## Flow

Single-page builder where clients add multiple campaigns in one submission:

```text
┌─────────────────────────────────────┐
│  New Campaign Request               │
│  [+ Add Campaign]                   │
│                                     │
│  ┌─ Campaign 1 ──────────────────┐  │
│  │ Post/Video Link: [________]   │  │
│  │ Platform: [auto-detect/pick]  │  │
│  │ Objective: [dropdown]         │  │
│  │ Daily Budget (USD): [___]     │  │
│  │ Description/Notes: [______]   │  │
│  │                    [Remove]   │  │
│  └───────────────────────────────┘  │
│                                     │
│  Summary: 2 campaigns, $30/day      │
│  [Submit All]                       │
└─────────────────────────────────────┘
```

## No Database Changes

Each campaign inserted as a separate row in existing `campaign_requests` table. The `duration_days` column will be left null or defaulted.

## Implementation — Rewrite `src/pages/NewCampaignRequest.tsx`

- **State**: `campaigns[]` array, each with: `creativeLink`, `platform`, `objective`, `dailyBudget`, `description`
- **Platform auto-detect**: `tiktok.com` → TikTok; `facebook.com`/`instagram.com` → Meta; else manual pick
- **"+ Add Campaign"**: Appends blank campaign card
- **Each card**: Inline fields (no wizard steps), remove button (disabled if only 1)
- **Summary footer**: Total campaigns & total daily budget
- **Validation**: Link, platform, objective, daily budget > 0 required per campaign
- **Submit**: Batch insert mapping `dailyBudget` → `budget_usd`, no duration field sent

## Files Modified

1. `src/pages/NewCampaignRequest.tsx` — Full rewrite

