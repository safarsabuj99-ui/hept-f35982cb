

## Fix: Set Original SaaS Colors as Branding Defaults

The current `useBranding.tsx` and `BrandingTab.tsx` default to purple (`#6d28d9`) and amber (`#f59e0b`), which don't match the actual SaaS theme. The real theme uses a blue primary (`226 70% 50%` ≈ `#2655cc`) and a light blue accent (`226 70% 95%` ≈ `#e8edf8`).

### Changes

**Files: `src/hooks/useBranding.tsx` and `src/components/settings/BrandingTab.tsx`**

Replace default color values:

| Property | Old Default | New Default |
|---|---|---|
| `primaryColor` | `#6d28d9` (purple) | `#2655cc` (blue) |
| `accentColor` | `#f59e0b` (amber) | `#e8eef8` (light blue) |

This ensures when no custom branding is set, the platform keeps its original blue theme instead of switching to purple/amber.

### Migration

Update the database column defaults to match:

```sql
ALTER TABLE public.organizations
  ALTER COLUMN primary_color SET DEFAULT '#2655cc',
  ALTER COLUMN accent_color SET DEFAULT '#e8eef8';
```

Two files edited + one small migration. No UI changes needed.

