

## Branding Settings for Agency Admin

### What This Does
Adds a "Branding" tab to Admin Settings where the agency admin can customize their logo, brand name, primary color, and accent color. These settings apply across the entire SaaS — sidebar, client portal header, login page, and mobile views — replacing the hardcoded "HEPT" name and default icon.

### Database Changes

**Migration: Add branding columns to `organizations` table**

```sql
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brand_name text DEFAULT 'HEPT',
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#6d28d9',
  ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#f59e0b';
```

`logo_url` already exists. No new tables needed.

**Storage: Create `brand-assets` bucket** for logo uploads (public, with RLS for authenticated uploads).

### New Files

| File | Purpose |
|---|---|
| `src/components/settings/BrandingTab.tsx` | Full branding settings UI: logo upload with preview, brand name input, color pickers for primary & accent colors, live preview card |
| `src/hooks/useBranding.tsx` | Context provider that loads org branding from DB once at app init, exposes `{brandName, logoUrl, primaryColor, accentColor}` to all components, caches in React context |

### Modified Files

| File | Change |
|---|---|
| `src/pages/Settings.tsx` | Add "Branding" tab with Paintbrush icon |
| `src/components/AdminLayout.tsx` | Replace hardcoded "HEPT" + BarChart3 icon with `useBranding()` values (logo image or fallback icon, brand name) |
| `src/components/ManagerLayout.tsx` | Same branding replacement |
| `src/components/ClientLayout.tsx` | Same branding replacement |
| `src/pages/Login.tsx` | Replace "HEPT Portal" with brand name, show logo if set |
| `src/App.tsx` | Wrap app with `BrandingProvider` |

### BrandingTab UI Design

Following the existing premium glass-card pattern:

1. **Logo Upload** — Drag-and-drop zone with current logo preview, uploads to `brand-assets` bucket, saves URL to `organizations.logo_url`
2. **Brand Name** — Text input (replaces "HEPT" everywhere)
3. **Primary Color** — Color input with hex field + visual swatch preview
4. **Accent Color** — Same as primary
5. **Live Preview** — Mini sidebar mockup showing how the brand looks in real-time before saving
6. **Save button** — Updates `organizations` row for the admin's `org_id`

### useBranding Hook Logic

```text
1. On mount → fetch org row using profile.org_id
2. Expose { brandName, logoUrl, primaryColor, accentColor, loading }
3. Apply primaryColor as CSS custom property (--brand-primary) on document root
4. After save in BrandingTab → refresh context
```

### How Branding Applies

- **Sidebar header**: Logo image (or fallback icon) + brand name instead of hardcoded "HEPT"
- **Mobile header**: Same
- **Login page**: Brand name + logo
- **Client portal**: Brand name + logo in header bar
- **Primary color**: Applied via CSS variable override so buttons, accents, and the gradient bar adapt automatically

### Technical Flow

```text
Admin saves branding
  → logo uploaded to brand-assets bucket
  → organizations row updated (brand_name, logo_url, primary_color, accent_color)
  → BrandingProvider re-fetches
  → all layouts re-render with new branding
  → CSS variable updated → theme colors change instantly
```

