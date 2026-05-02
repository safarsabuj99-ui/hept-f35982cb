## Problem

In the global ⌘K / mobile search, typing a client's exact name sometimes returns no result (or hides the right client). Two real bugs in `src/components/dashboard/ClientSearchCommand.tsx` cause this:

### Bug 1 — Duplicate `value` collisions (cmdk dedupes items)

Each `CommandItem` is rendered with:

```ts
value={client._searchValue}
```

`_searchValue` is just the concatenation of name + email + business + phone + keyword + amount. cmdk (the underlying `Command` library) requires **unique `value` per item** — when two items share the same `value`, only one is kept in the filtered list. This happens whenever:

- Two clients share the same full name (very common: "Akram", "Rahim", etc.)
- A client has empty business/email/phone/keyword and only the name distinguishes them
- Two rows produce identical token strings after the `filter(Boolean).join(" ")`

Result: the matching client is silently dropped from the list even though the search string matches.

### Bug 2 — Default cmdk fuzzy scorer misses valid substrings

cmdk uses `command-score` by default. For long concatenated strings with many tokens, short queries like `akram` can score `0` against a row whose name actually contains "Akram" — especially when the matching token isn't first or when the string contains digits/punctuation from the amount tokens. This intermittently filters out exact-name matches.

## Fix (smart, minimal, robust)

Edit `src/components/dashboard/ClientSearchCommand.tsx`:

1. **Make every CommandItem value unique** by appending the `user_id`:
   ```ts
   const searchValue = `${tokens.filter(Boolean).join(" ")} ::${c.user_id}`;
   ```
   The `::user_id` suffix guarantees uniqueness without affecting human queries (no admin types `::uuid`).

2. **Replace cmdk's default fuzzy filter with a deterministic substring matcher** on `<Command filter={...}>`:
   ```tsx
   <Command
     filter={(value, search) => {
       if (!search) return 1;
       const haystack = value.toLowerCase();
       const needle = search.trim().toLowerCase();
       // Multi-token AND match: every whitespace-separated token must appear
       const tokens = needle.split(/\s+/).filter(Boolean);
       return tokens.every((t) => haystack.includes(t)) ? 1 : 0;
     }}
   >
   ```
   This guarantees: if the typed text (or each whitespace token of it) appears anywhere in the row's search string, the row is shown. No fuzzy false-negatives, no silent drops.

3. Keep the existing token-rich `_searchValue` (name, email, business, phone, mapping_keyword, amount, status flags) so all existing search vectors keep working — we're only changing the **scoring** and **uniqueness**, not the searchable surface.

## Files touched

- `src/components/dashboard/ClientSearchCommand.tsx` — 2 small edits (value suffix + custom `filter` prop on `<Command>`).

No DB / RPC / data layer changes needed. The data already arrives correctly from `useGlobalClientSearch`; only the client-side filter was dropping rows.

## Why this is the permanent fix

- Unique values eliminate the entire class of "duplicate-name disappears" bugs.
- A pure substring filter is predictable: an exact name will *always* match. No future admin will hit the fuzzy-scorer edge case again.
- Multi-token AND matching ("hasib bkash") still works for compound queries.
