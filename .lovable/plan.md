

# Multi-Select Assignment for Ad Accounts and Clients

## Problem
Both the Client Detail "Ad Accounts" tab and the Ad Account Detail "Clients" tab only allow assigning **one item at a time** via a single-select dropdown. This is tedious when linking multiple accounts/clients.

## Solution
Replace the single `Select` dropdown with a **multi-select checkbox list** using a Popover + Command pattern (already available in the project). Users can check multiple items, then click "Assign All" to bulk-insert.

## Changes

### 1. `src/pages/ClientDetail.tsx` — Ad Accounts tab
- Replace `newAdAccountId` (string) with `selectedAdAccountIds` (string array)
- Replace `<Select>` with a Popover containing a searchable Command list with checkboxes for each unassigned ad account
- Show selected count on the trigger button (e.g. "3 accounts selected")
- Update `handleAssignAdAccount` to loop and insert all selected accounts with the same mapping keyword, then clear selection

### 2. `src/pages/AdAccountDetail.tsx` — Clients tab
- Replace `newClient` (string) with `selectedClientIds` (string array)
- Replace `<Select>` with same Popover + Command + Checkbox multi-select pattern
- Show selected count on trigger
- Update `addAssignment` to bulk-insert all selected clients with the same mapping keyword

### UI Pattern (both pages)
```
┌─────────────────────────────┐  ┌──────────────┐  ┌────────────┐
│ ▼ Select accounts (3)       │  │ Keyword      │  │ Assign All │
└─────────────────────────────┘  └──────────────┘  └────────────┘
  ┌───────────────────────────┐
  │ 🔍 Search...              │
  │ ☑ Account Alpha (Meta)    │
  │ ☑ Account Beta (Google)   │
  │ ☐ Account Gamma (TikTok)  │
  │ ☑ Account Delta (Meta)    │
  └───────────────────────────┘
```

### Files Changed

| File | Change |
|------|--------|
| `src/pages/ClientDetail.tsx` | Multi-select ad accounts in assignment form |
| `src/pages/AdAccountDetail.tsx` | Multi-select clients in assignment form |

