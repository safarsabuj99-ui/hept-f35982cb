

## Update Campaign Analytics KPI Cards

### What Changes
Replace the current 4 KPI cards (Total Spend, Total Results, **Avg ROAS**, Avg CPO) with 5 new KPIs:

1. **Total Spend** (keep)
2. **Total Results** (keep)  
3. **Create Order** — sum of `create_order` across all campaigns
4. **Total Leads** — sum of `leads_tiktok_dm` across all campaigns
5. **Total Messages** — sum of `messaging_conversations` + `conversations_tiktok_dm` + `conversations_instant_msg` (Meta + TikTok combined)

Remove: **Avg ROAS** and **Avg CPO**

### File: `src/components/client-analytics/CampaignAnalyticsPanel.tsx`

- Update `totals` useMemo to aggregate `create_order`, `leads_tiktok_dm`, `messaging_conversations`, `conversations_tiktok_dm`, `conversations_instant_msg`
- Remove `avgRoas` and `avgCpo` calculations
- Replace the 4-card grid with a 5-card grid (`grid-cols-2 lg:grid-cols-5`) using appropriate icons:
  - Total Spend — DollarSign (green)
  - Total Results — ShoppingCart (blue)
  - Create Order — Package (purple)
  - Total Leads — Users (orange)
  - Total Messages — MessageCircle (pink)
- Import new icons from lucide-react (`Package`, `Users`, `MessageCircle`)

### Layout
- Mobile: `grid-cols-2` (last card spans full width via `col-span-2 lg:col-span-1`)
- Desktop: `grid-cols-5` — all cards equal width

