

## Plan: Fix TikTok page_size limit error

### Problem
The `auto-import-accounts` edge function sets `pageSize = 100` on line 110, but the TikTok `/bc/asset/get/` endpoint only allows a maximum of 50. This causes error code 40002.

### Fix
In `supabase/functions/auto-import-accounts/index.ts`, change line 110:
```
const pageSize = 100;  →  const pageSize = 50;
```

Also check `test-connection/index.ts` for the same issue (it uses `page_size=1` so it's fine).

One-line fix, no other changes needed.

