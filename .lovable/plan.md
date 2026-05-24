## Bug Found

**Root cause:** `AICampaignBuilder.tsx` queries `profiles.id` for the Client dropdown and uses that value as the `clientId` filter against `ad_account_clients.client_id`. But across the entire app, `ad_account_clients.client_id` stores the **auth user_id** (i.e. `profiles.user_id`), not `profiles.id`. So the filter always returns 0 rows — the ad-account dropdown stays empty even when a client (e.g. Atyab) has 6 ad accounts mapped.

Verified in DB:
- `Atyab` → `profiles.id = 14818d42…` (used today) → 0 rows in `ad_account_clients`
- `Atyab` → `profiles.user_id` → **6 rows** in `ad_account_clients` ✅

Also, the client list isn't restricted to users with role `client`, so admins/managers/owners pollute the dropdown.

## Fix

1. **Restrict clients to role = 'client'** — query `user_roles` (`role = 'client'`), then load matching `profiles` by `user_id`, mirroring `ClientList.tsx`.
2. **Use `user_id` as the value** of the Client select (not `profiles.id`).
3. **Filter ad accounts** with `ad_account_clients.client_id = <user_id>` (no other code change needed since the query already uses `clientId`).
4. **Empty states & UX polish:**
   - Loading skeletons on both selects while fetching.
   - When a client has zero mapped ad accounts, show inline hint: *"No ad accounts mapped to this client. Go to Client → Ad Accounts to map one."*
   - Searchable client combobox (Atyab/agency lists can be long).
   - Show ad-account currency + platform badge in the option, already partly there — keep it.
5. **Persist last selection** in `localStorage` (`aicb:lastClientId`, `aicb:lastAdAccountId`) for faster repeat use.

## Files touched

- `src/pages/AICampaignBuilder.tsx` — fix queries, swap `id` → `user_id`, add role gate, loading/empty states, searchable client picker, persistence.

No DB migration, no edge-function change required.
