

## Plan: Fix CampaignMapping.tsx to Hide Inactive Campaigns Without Data

**Root Cause:** The `/admin/campaigns` page (`CampaignMapping.tsx`) was never updated with the `isActiveStatus` fix. Two issues:

1. **Line 160:** Uses `c.status === "active"` instead of `isActiveStatus(c.status)` for injecting active campaigns without metrics
2. **Line 177:** Returns `Object.values(map)` with **no filter at all** — every campaign with any metric row appears, including paused campaigns with all zeros

### Changes

**File: `src/pages/CampaignMapping.tsx`**

1. Add import at top: `import { isActiveStatus } from "@/lib/campaignStatus";`

2. Line 160 — change active campaign injection check:
   - From: `if (c.status === "active" && !map[c.id])`
   - To: `if (isActiveStatus(c.status) && !map[c.id])`
   - Also use `status: c.status` instead of hardcoded `status: "active"` (line 164)

3. Line 177 — add the same filter used in the other pages:
   - From: `return Object.values(map);`
   - To:
   ```typescript
   return Object.values(map).filter(r =>
     isActiveStatus(r.status) || r.spend > 0 || r.impressions > 0 || r.clicks > 0 || r.results > 0
   );
   ```

This applies the exact same pattern already working in `ClientReports.tsx`, `ClientDetail.tsx`, and `AdAccountDetail.tsx`.

