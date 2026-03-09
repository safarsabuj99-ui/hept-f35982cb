

# Plan: Enable Full Real-Time Data Across All Pages

## Current State
**Already have realtime enabled (database publication):**
- `daily_ad_spend`, `transactions`, `payment_requests`, `campaign_performance`, `campaign_requests`

**Already have realtime subscriptions (code):**
- `AdminDashboard` — listens to `transactions`, `daily_metrics`
- `ClientDashboard` — listens to `transactions`, `daily_metrics`
- `PaymentRequests` — listens to `payment_requests`, `transactions`
- `OrderManagement` — listens to `campaign_requests`
- `MyCampaignRequests` — listens to `campaign_requests`

**Missing realtime — pages that fetch data but don't subscribe:**
1. `FinanceDashboard` — profit/loss, WAC, expenses
2. `CampaignMapping` — campaign table (admin)
3. `ClientReports` — client-side campaign reports
4. `ClientList` — client overview with balances/margins
5. `WalletInventory` — USD purchases
6. `CashFlowManagement` — agency accounts, expenses, transfers
7. `AdAccounts` — ad account list
8. `AuditLogs` — audit log feed
9. `TeamManagement` — manager list
10. `Integrations` — API integrations

## Changes

### Step 1: Enable realtime publication for missing tables

New migration to add tables not yet in the realtime publication:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.usd_purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agency_expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agency_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fund_transfers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.api_integrations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_account_clients;
```

### Step 2: Add realtime subscriptions to each page

Each page gets a `useEffect` that creates a Supabase channel, subscribes to relevant table changes, and calls the existing `fetch` function on any change. Channel is cleaned up on unmount.

| Page | Tables to listen |
|------|-----------------|
| `FinanceDashboard` | `transactions`, `daily_ad_spend`, `usd_purchases`, `agency_expenses` |
| `CampaignMapping` | `campaign_performance`, `daily_metrics`, `campaigns` |
| `ClientReports` | `campaign_performance`, `daily_metrics` |
| `ClientList` | `profiles`, `transactions`, `daily_ad_spend` |
| `WalletInventory` | `usd_purchases` |
| `CashFlowManagement` | `agency_accounts`, `agency_expenses`, `fund_transfers`, `usd_purchases` |
| `AdAccounts` | `ad_accounts`, `ad_account_clients` |
| `AuditLogs` | `audit_logs` |
| `TeamManagement` | `profiles` |
| `Integrations` | `api_integrations` |

Also enhance existing subscriptions:
- `AdminDashboard` — add `daily_ad_spend`, `usd_purchases`, `profiles` listeners
- `ClientDashboard` — add `campaign_performance` listener

### Pattern (same for all pages)
```typescript
useEffect(() => {
  const channel = supabase
    .channel("page-name-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "table1" }, () => fetchData())
    .on("postgres_changes", { event: "*", schema: "public", table: "table2" }, () => fetchData())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [fetchData]);
```

### Files Modified
- New database migration (enable realtime publication)
- `src/pages/FinanceDashboard.tsx`
- `src/pages/CampaignMapping.tsx`
- `src/pages/ClientReports.tsx`
- `src/pages/ClientList.tsx`
- `src/pages/WalletInventory.tsx`
- `src/pages/CashFlowManagement.tsx`
- `src/pages/AdAccounts.tsx`
- `src/pages/AuditLogs.tsx`
- `src/pages/TeamManagement.tsx`
- `src/pages/Integrations.tsx`
- `src/pages/AdminDashboard.tsx` (enhance)
- `src/pages/ClientDashboard.tsx` (enhance)

