

## Upgrade Hero Dashboard Mockup to Realistic Style

### Problem
The hero section's `DashboardMockup` (lines 204-251) uses generic gray placeholder bars for KPI values, a plain bar chart, and featureless list rows — it looks like a wireframe while the 4 feature mockups below have realistic data, labels, colors, and badges.

### Changes
Rewrite the `DashboardMockup` component to match the realistic detail level of the feature mockups:

**KPI Cards Row** — Replace gray placeholder bars with actual values:
- Total Clients: **24** (with "+3 this week" subtitle)
- Active Spend: **$12,840** (with "across 3 platforms")
- Revenue: **$18,200** (with "+12% MoM")
- Profit: **$5,360** (in green, with "18.2% margin")

**Bar Chart** — Keep the same bar layout but add:
- X-axis month labels (Jul–Dec)
- Two-tone bars (spend vs revenue) with a mini legend
- Subtle grid lines

**Client List Rows** — Replace generic circle+gray bars with:
- Client initials in colored avatar squares
- Client names + platform badges (Meta/TikTok/Google colored dots)
- Spend amount on the right
- Status badge (Active/Scaling/New) with appropriate colors

**URL Bar** — Already has `app.heptbd.com/dashboard` — keep as-is.

### File Changed
- `src/pages/LandingPage.tsx` — Rewrite lines 204-251 (`DashboardMockup` function)

### No Database Changes

