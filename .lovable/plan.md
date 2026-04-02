

## Rename "AdSpend" → "HEPT" Across the Entire Project

Replace every user-visible occurrence of "AdSpend" with "HEPT" across 9 files. Variable names like `adSpend`, `totalAdSpend` that refer to ad spending data (not branding) will be left unchanged.

### Files to Update

| File | Changes |
|------|---------|
| **index.html** | Title → "HEPT - Ad Management Platform", meta author → "HEPT", apple-mobile-web-app-title → "HEPT", og:title → "HEPT - …" |
| **public/manifest.json** | `name` → "HEPT - Ad Management Platform", `short_name` → "HEPT" |
| **public/sw.js** | Default notification tag → "hept-notification", fallback title → "HEPT" |
| **src/components/AdminLayout.tsx** | Two brand text instances → "HEPT" |
| **src/components/ClientLayout.tsx** | Brand text → "HEPT" |
| **src/components/ManagerLayout.tsx** | Two brand text instances → "HEPT" |
| **src/pages/Login.tsx** | "AdSpend Portal" → "HEPT Portal", "Powered by AdSpend" → "Powered by HEPT" |
| **src/pages/Settings.tsx** | No branding text — no changes needed |
| **supabase/functions/send-push/index.ts** | VAPID subject email → "mailto:admin@hept.app" |

### What stays unchanged
- Variable names (`adSpend`, `setAdSpend`, `filteredAdSpend`, `totalAdSpend`) — these are code-level references to ad spending data, not branding.

