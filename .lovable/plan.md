

## Fix: Align Mobile Profitability Rows

The issue is that the three data values (spend, profit, margin) are not aligned across rows — each client name has a different length, pushing values to different positions. This makes it look messy.

### Solution

Use a **fixed-width grid layout** instead of `justify-between` so all values line up in columns:

```text
Before (messy - values shift based on name length):
│ ▶ MD ARIF BEPARY     $18.3 ৳23  +1.7%  │
│ ▶ Yasin Arafat  $8.24 ৳166  +13.5%     │

After (aligned columns):
│ ▶ MD ARIF BEPARY      $18.3   ৳23   +1.7%  │
│ ▶ Yasin Arafat         $8.24  ৳166  +13.5%  │
```

### Changes — `src/components/dashboard/ProfitabilityTable.tsx`

**Mobile row layout (lines 232-247):** Replace the flex `justify-between` with a CSS grid:
- Client name takes remaining space with `truncate`
- Spend, Profit, Margin each get fixed-width columns with `text-right` alignment
- Grid template: `grid-cols-[14px_1fr_auto_auto_auto]` — chevron, name, spend (w-14), profit (w-14), margin badge (w-16)
- This ensures all dollar amounts, taka amounts, and badges line up vertically across all rows

**Expanded platform rows (lines 250-265):** Apply same column alignment so platform breakdowns also align under the parent values.

