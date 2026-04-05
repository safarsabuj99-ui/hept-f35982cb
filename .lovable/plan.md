

## Campaign Request System Upgrade

### Problem
Currently, each campaign task (e.g., one TikTok ad, one Meta ad) is stored as a separate row in `campaign_requests`. There is no concept of a "batch" or "request group" -- a client who submits 5 campaigns for the same product creates 5 unrelated rows. The admin sees them as individual items with no grouping context.

### Solution
Introduce a parent-child model: **Campaign Requests** (parent) contain multiple **Campaign Tasks** (children). A client creates one request with a title/product name, then adds multiple campaign tasks (TikTok, Meta, Google) each with their own budget, objective, and creative link.

```text
campaign_requests (parent)
  ├── id, client_id, title, notes, status, total_budget
  └── campaign_tasks (children)
       ├── task 1: TikTok, $20/day, Message objective
       ├── task 2: Meta, $15/day, Sales objective
       └── task 3: Meta, $10/day, Traffic objective
```

### Database Changes (Migration)

**1. Create `campaign_tasks` table** — stores individual campaign items:
- `id`, `request_id` (FK to campaign_requests), `platform`, `objective`, `budget_usd`, `creative_link`, `ad_caption`, `quantity` (how many campaigns to create for same product), `status` (pending/processing/completed/rejected), `rejection_reason`, `created_at`
- RLS: admin ALL, client SELECT where request_id belongs to them, manager SELECT for managed clients

**2. Alter `campaign_requests` table** — becomes the parent container:
- Add `title` (text, default '') — product/campaign group name
- Add `total_budget_usd` (numeric, default 0) — auto-calculated sum
- Add `task_count` (integer, default 0) — number of child tasks
- Keep existing columns (`client_id`, `status`, `created_at`, etc.)
- Existing fields like `platform`, `objective`, `budget_usd`, `creative_link` remain for backward compatibility but new submissions will use the tasks table

**3. Update notification triggers** — `notify_on_campaign_request` will reference the parent request title and task count instead of individual platform/budget

### Client-Side: New Campaign Request (`NewCampaignRequest.tsx`)

Complete redesign:
- **Step 1 — Request Info**: Title/product name field, general notes
- **Step 2 — Campaign Tasks**: Add multiple tasks, each with: Platform, Objective, Budget, Creative Link, Ad Caption, Quantity (how many campaigns to create)
- Summary bar shows: total tasks, total daily budget, platform breakdown (e.g., "2 Meta, 1 TikTok")
- Submit creates one `campaign_requests` row + N `campaign_tasks` rows

### Client-Side: My Campaign Requests (`MyCampaignRequests.tsx`)

- Rename display to "Campaign Requests"
- Each row shows the parent request: title, task count, total budget, overall status
- Expandable to show individual tasks with their own status badges
- Per-task status tracking (some tasks approved, some rejected within same request)

### Admin-Side: Campaign Request System (`OrderManagement.tsx`)

- Rename from "Order Management" to "Campaign Requests"
- Update sidebar label from "Orders" to "Campaign Requests"
- Each row shows the parent request with client name, title, task count, total budget
- Detail dialog redesigned to show a task list within the request
- Admin can approve/reject/process individual tasks or bulk-action all tasks
- Parent request status auto-derives from children (all completed = completed, any pending = pending, etc.)

### Sidebar & Routes
- `AdminLayout.tsx`: Change label "Orders" to "Campaign Requests", keep route `/admin/orders`
- `usePendingCounts.tsx`: Update query to count parent requests with any pending tasks

### Files Changed (~7 files)

| File | Change |
|------|--------|
| **Migration SQL** | Create `campaign_tasks` table, alter `campaign_requests`, update notification trigger |
| `NewCampaignRequest.tsx` | Redesign with parent request + child tasks model, quantity field |
| `MyCampaignRequests.tsx` | Show grouped requests with expandable task lists |
| `OrderManagement.tsx` | Rename to "Campaign Requests", grouped view with per-task actions |
| `AdminLayout.tsx` | Rename sidebar "Orders" to "Campaign Requests" |
| `usePendingCounts.tsx` | Update pending count query for new structure |

### Backward Compatibility
- Existing `campaign_requests` rows (with `platform`, `budget_usd` directly on them) continue to display correctly as "legacy" single-task requests
- New submissions always create parent + tasks

