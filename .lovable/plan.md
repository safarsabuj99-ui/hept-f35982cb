

# Plan: Sortable & Filterable Client List with Default Sort Preference

## Overview
Add sort controls to every column in the Client List table, plus the ability to save a default sort as a persistent preference.

## Changes

### 1. Update `src/pages/ClientList.tsx`

**Sort state**: Add `sortKey` (name/business/email/pricing/margin/balance) and `sortAsc` (boolean) state, defaulting from saved preference.

**Sort logic**: Before filtering/paginating, sort the `clients` array:
- `name` → alphabetical on `full_name`
- `business` → alphabetical on `business_name`
- `email` → alphabetical on `email`
- `pricing` → alphabetical on pricing label string
- `margin` → numeric on `margins[id].margin`
- `balance` → numeric on `balances[id]`

**Column headers**: Replace static `<TableHead>` text with clickable sort buttons showing an `ArrowUpDown` icon (same pattern used in `ClientOverviewTable.tsx`). Active sort column gets a highlight indicator.

**"Set as Default" button**: Small button near the sort controls that saves `{ clientListSort: { key, asc } }` into the user's `permissions` JSONB via `usePresetPreferences` (extend the hook with a generic `getPreference`/`setPreference` method, or add dedicated `clientListSort` field).

**Mobile cards**: Sort applies to mobile card view too (same sorted array feeds both views).

### 2. Extend `src/hooks/usePresetPreferences.tsx`

Add two generic methods:
- `getUiPref(key: string): any` — reads from `prefs.ui_prefs?.[key]`
- `setUiPref(key: string, value: any)` — merges into `permissions.ui_prefs` in the profiles table

This keeps the hook reusable for future UI preferences without cluttering dedicated methods.

### 3. Load default sort on mount

On page load, read `getUiPref("clientListSort")` to initialize `sortKey` and `sortAsc`. If no saved preference, default to `balance` descending.

## Files Modified

1. `src/pages/ClientList.tsx` — Add sort state, sort logic, clickable headers, "Set Default" button
2. `src/hooks/usePresetPreferences.tsx` — Add generic `getUiPref` / `setUiPref` methods

