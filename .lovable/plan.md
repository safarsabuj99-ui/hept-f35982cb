

## Add per-task Product / Campaign Name

### What's changing

Right now the request form has **one** "Campaign / Product Name" at the top, and each task only carries link + platform + objective + budget + caption. Since a single request can bundle tasks for **different products** (e.g., Task 1 = Product A, Task 2 = Product B), each task needs its own product name.

### The fix (3 small changes)

**1. Database — add column**

Migration adds an optional `product_name` column to `campaign_tasks`:

```sql
ALTER TABLE public.campaign_tasks
  ADD COLUMN IF NOT EXISTS product_name TEXT;
```

Nullable + no default — old tasks stay untouched, no data migration needed.

**2. Client form — `src/pages/NewCampaignRequest.tsx`**

- Add `productName: string` to the `TaskEntry` interface and `EMPTY_TASK`.
- Add a new input as the **first field** inside each Task card (above "Post / Video Link"):
  ```
  Label: "Product / Campaign Name *"  (icon: Package)
  Placeholder: "e.g. Summer Tee, iPhone Case Launch"
  ```
- Make it **required** in `isTaskValid()` (`!!t.productName.trim()`).
- Keep the parent-level "Campaign / Product Name" field — relabel it to **"Request Title *"** with placeholder `"e.g. Week 47 Campaigns"` so users understand it's the umbrella label, while each task gets its own product name.
- Include `product_name: t.productName.trim()` in the `taskRows` insert.

**3. Display — `OrderManagement.tsx` (admin) & `MyCampaignRequests.tsx` (client)**

In each task sub-row, show the product name prominently next to the task index:
```
#1  [Product Name]  · Meta · Message · ×2
```
Falls back gracefully to "—" for legacy tasks without a product name.

### Layout of a task card (after change)

```
┌─ TASK 1 ────────────────────────────── 🗑
│  📦 Product / Campaign Name *
│  [ Summer Sale Tee                   ]
│
│  🔗 Post / Video Link *
│  [ https://tiktok.com/...            ]
│
│  Platform * | Objective * | Budget * | Qty
│  [Meta  ▾]   [Message ▾]   [10.00]    [1]
│
│  Ad Caption / Notes
│  [ ...                                ]
└────────────────────────────────────────
```

### Files Changed

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | `ALTER TABLE campaign_tasks ADD COLUMN product_name TEXT` |
| `src/pages/NewCampaignRequest.tsx` | Add `productName` to TaskEntry; add input as first field in each task card; require it in validation; relabel parent field to "Request Title"; include in insert payload |
| `src/pages/OrderManagement.tsx` | Render `task.product_name` (with `—` fallback) in the expanded task sub-rows |
| `src/pages/MyCampaignRequests.tsx` | Render `task.product_name` (with `—` fallback) in the expanded task list |

Zero changes to status flow, notifications, or RLS. No breaking change for old requests — `product_name` is nullable.

### Build time
~5 minutes. One migration + three file edits.

