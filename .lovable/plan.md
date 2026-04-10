

## Unique Feature Mockups for Landing Page

### Problem
All 4 feature sections currently share the same generic dashboard wireframe mockup (3 rows + bar chart). The user wants each feature to have a distinct, contextually relevant visual that matches what that feature actually does.

### Solution
Replace the shared mockup (lines 441-469) with 4 unique inline mockup components, each visually representing the actual feature.

### Mockup Designs (all CSS-only, no images)

**1. Automated Daily Reporting Mockup**
- Tabbed header showing "Meta | TikTok | Google" with one active
- 4 mini KPI cards in a row (Spend, Impressions, Clicks, ROAS) with colored values
- A data table with 3-4 rows showing campaign names, spend bars, and status badges
- A "Send Report" button wireframe at bottom

**2. Smart Ad Account Organization Mockup**
- Tree/hierarchy view: Client name → branching to 2-3 platform icons with account IDs
- Color-coded platform badges (blue=Meta, cyan=TikTok, multicolor=Google)
- 2-3 client rows showing the mapping visually
- A small "drag-to-assign" indicator

**3. Client Balance Tracker Mockup**
- Table-style layout: Client name | Deposited | Spent | Remaining
- 3 client rows with progress bars showing spend vs. deposit ratio
- Color coding: green for healthy balance, amber for low, red for critical
- A total summary bar at the bottom

**4. Agency Profit & Dollar Management Mockup**
- Top row: 3 KPI boxes (USD Purchased, WAC Rate, Profit Margin %)
- A mini area/line chart showing profit trend
- A row showing "Forecast: Need $X,XXX by next week"
- Green/red indicators for profit/loss

### Files Changed
- `src/pages/LandingPage.tsx` — Replace the generic mockup block (lines 440-470) with a conditional renderer that picks the right mockup component based on feature index. Add 4 new inline components: `ReportingMockup`, `AccountOrgMockup`, `BalanceTrackerMockup`, `ProfitMockup`.

### No Database Changes
Visual-only update to the landing page.

