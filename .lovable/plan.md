

## Platform-Aware KPI Widgets

### Current behavior
KPI cards (Spend / Results / Create Order / Leads / Messages) always show **totals across all platforms**, regardless of which platform tab (Meta / TikTok / Google) is active. Switching tabs only filters the table below — the KPIs above stay static.

### New behavior
KPIs reflect the **currently selected platform tab**:
- **All** tab → totals across all platforms (current behavior)
- **Meta** tab → only Meta campaigns counted in KPIs
- **TikTok** tab → only TikTok campaigns counted
- **Google** tab → only Google campaigns counted

KPI numbers animate/update instantly on tab switch.

### Implementation (single file: `src/components/client-analytics/CampaignAnalyticsPanel.tsx`)

1. **Lift Tabs to controlled state**: Convert `<Tabs defaultValue="all">` to controlled with `const [activeTab, setActiveTab] = useState<PlatformTab>("all")`.

2. **Make `totals` reactive to `activeTab`**: Replace the single `totals` memo with a function that takes a row set, then derive `activeRows` from `activeTab`:
   ```ts
   const activeRows = activeTab === "meta" ? metaRows
                    : activeTab === "tiktok" ? tiktokRows
                    : activeTab === "google" ? googleRows
                    : campaignRows;
   const totals = useMemo(() => computeTotals(activeRows), [activeRows]);
   ```

3. **Wire `onValueChange={setActiveTab}`** on the `<Tabs>` component so the state stays in sync.

No other files touched. No schema, no logic risk — pure UI reactivity. Per-platform tabs (table contents, badges, presets) all keep working exactly as before.

### Build time
~2 minutes. One file, ~10 lines changed.

