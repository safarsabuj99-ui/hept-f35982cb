

## Fix: Update Existing Organization Row to Blue Theme

### Problem
The migration only changed the **default** for new rows. The existing organization row still has `primary_color = '#6d28d9'` (purple) and `accent_color = '#f59e0b'` (amber). The `useBranding` hook reads these values and overrides the CSS variables, making the sidebar purple.

### Fix
One migration to update the existing data:

```sql
UPDATE public.organizations
SET primary_color = '#2655cc',
    accent_color = '#e8eef8'
WHERE primary_color = '#6d28d9'
   OR accent_color = '#f59e0b';
```

This updates all existing organizations that still have the old purple/amber values to the correct blue theme. One migration, no code changes needed.

