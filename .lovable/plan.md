

## Add Active / Inactive Tabs to Ad Accounts Page

### Changes — Single file: `src/pages/AdAccounts.tsx`

1. **Import `Tabs, TabsList, TabsTrigger, TabsContent`** from `@/components/ui/tabs`

2. **Add tab state** — `activeTab` defaulting to `"active"`

3. **Split filtering logic** — after the existing `filteredAccounts` (search filter), add a second filter step:
   - `"active"` tab → `filteredAccounts.filter(a => a.is_active)`
   - `"inactive"` tab → `filteredAccounts.filter(a => !a.is_active)`

4. **Wrap the content area** (search bar + table/cards) in a `Tabs` component with two triggers:
   - **Active** — shows count badge of active accounts
   - **Inactive** — shows count badge of inactive accounts

5. **Reset `currentPage` to 1** when tab changes

6. **Update pagination** to use the tab-filtered list length

### UI Layout
```text
[Active (12)]  [Inactive (3)]
┌─────────────────────────────┐
│ 🔍 Search...                │
├─────────────────────────────┤
│  Table / Card list          │
│  (filtered by active tab)   │
├─────────────────────────────┤
│  Pagination                 │
└─────────────────────────────┘
```

The search bar, bulk delete bar, and pagination all remain inside each tab content so they operate on the correct subset. Both mobile card view and desktop table view use the same filtered list.

