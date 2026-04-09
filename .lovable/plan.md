

## Fix: Client Notices Showing When Deactivated

### Bug
The `ClientNoticeBanner` component fetches **all** notices from the `client_notices` table without filtering by the `is_active` column. The notice in the database has `is_active = false`, but it still appears on the client dashboard because the query never checks this field.

### Fix

**File: `src/components/ClientNoticeBanner.tsx`** (line 69)

Add `.eq("is_active", true)` to the Supabase query:

```typescript
const { data } = await supabase
  .from("client_notices")
  .select("id, title, message, type, target_type, target_ids")
  .eq("is_active", true);
```

Also add `is_active` to the `Notice` interface for type safety, though it won't be needed in filtering since the query handles it server-side.

This is a one-line fix. No migration or other file changes needed.

