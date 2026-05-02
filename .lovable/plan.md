## Why mobile shows "no data" but lovable preview works

Two things are happening together:

### 1. The deployed PWA is serving an older JS bundle

The previous search fix (custom `filter` + `::user_id` suffix on `value`) lives in the codebase and works in the lovable preview, but the published mobile app at `hept.lovable.app` / `heptbd.com` still ships the *previous* build. Until we publish, mobile users keep hitting the old fuzzy-scorer code where "hasib" silently returns nothing.

### 2. Even after publish, the current `value`-only trick is fragile

We currently stuff every searchable token (name + email + business + phone + keyword + amount + status flags + `::uuid`) into the single `value` string of `<CommandItem>`. cmdk normalizes that string (lowercases, collapses `[\s-]` to spaces) before matching and storing — making collisions and edge cases possible. The library actually has a first-class API for exactly this: pass a stable unique `value` and feed all searchable text through the `keywords` prop. cmdk's `filter(value, search, keywords)` then receives `keywords` as an array, which is what we should be matching against.

This rewrite eliminates the `::uuid` hack and matches cmdk's intended contract.

## Plan

Edit **`src/components/dashboard/ClientSearchCommand.tsx`**:

1. Replace the single `_searchValue` string with two fields on each enriched client:
   - `_value`: stable unique id (just `client.user_id`) — used as `<CommandItem value=...>`. Guarantees uniqueness and prevents cmdk dedupe.
   - `_keywords`: `string[]` of every searchable token (`full_name`, `email`, `business_name`, `phone`, `mapping_keyword`, rounded balance, "paused" / "pending" / "inactive" flags). Pre-lowercased and de-duped.

2. On `<CommandItem>` use:
   ```tsx
   <CommandItem
     value={client._value}
     keywords={client._keywords}
     onSelect={...}
   >
   ```

3. Update the custom `filter` on `<Command>` to use the `keywords` argument (cmdk passes it as the 3rd arg) instead of the `value` arg:
   ```tsx
   filter={(_value, search, keywords) => {
     if (!search) return 1;
     const hay = (keywords ?? []).join(" ").toLowerCase();
     const needles = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
     return needles.every((t) => hay.includes(t)) ? 1 : 0;
   }}
   ```
   This is fully deterministic: if every typed token appears anywhere in the keyword list, the row shows. No fuzzy false negatives, no value-collision dedupe, ever.

4. Keep all existing UI (Quick Actions row, recents, KPI strip, mobile bottom pill) untouched — only the matching layer changes.

5. Bump `public/sw.js` with a small version comment so service workers update on next visit, and ensure the published PWA picks up the fix immediately:
   ```js
   // v2 — search filter rewrite
   ```
   (`sw.js` already caches nothing, but bumping triggers `install` → `skipWaiting` → `clients.claim`, forcing the new HTML/JS to load.)

6. After the code edit is in, publish so the mobile app at `hept.lovable.app` / `heptbd.com` actually serves the fixed bundle.

## Files touched

- `src/components/dashboard/ClientSearchCommand.tsx` — swap `value`/filter to use cmdk `keywords` API.
- `public/sw.js` — version-bump comment to force SW refresh on mobile.

No DB / RPC changes. No prop API changes for callers.

## Why this is the permanent fix

- `value = user_id` is guaranteed unique → cmdk can never silently drop a duplicate-name client again.
- `keywords` is cmdk's official multi-token search input — searches like "hasib", "bkash", "01700…", "Women's World" all hit the same array and match on substring with zero scorer ambiguity.
- Service-worker version bump means the next time the user opens the mobile PWA, they get the fixed bundle without needing to manually clear cache.
