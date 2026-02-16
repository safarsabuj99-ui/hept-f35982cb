
# Fix: Custom Exchange Rate Not Persisting / Showing on Client List

## Problem
After saving a custom exchange rate on the Client Detail page, the Client List still shows "Global" for all clients. The database confirms all `custom_exchange_rate` values are currently `null`, suggesting the update may be silently failing (RLS policies returning 0 affected rows without an error) or the Client List isn't refreshing after navigation.

## Root Causes
1. **Silent RLS failure**: The Supabase `.update()` call doesn't verify rows were actually affected -- it only checks for `error`. If RLS blocks the update, `error` is `null` but no rows change.
2. **Stale data on Client List**: The Client List fetches data once on mount via `useEffect([], [])`. When navigating back from Client Detail, React Router may reuse the mounted component, so data isn't re-fetched.

## Fix Plan

### 1. `src/pages/ClientDetail.tsx` -- Verify update success
- After the `.update()` call, check the response `count` or re-fetch the profile to confirm the exchange rate was actually saved.
- Add `.select()` to the update chain to get back the updated row, and verify `custom_exchange_rate` matches the input.
- If no rows were returned, show an error toast instead of the success message.

### 2. `src/pages/ClientList.tsx` -- Refresh data on navigation
- Change the `useEffect` dependency to re-fetch client data when the component regains focus or when navigation occurs.
- Use React Router's `useLocation` to detect when the user navigates back to `/admin/clients`, triggering a data reload.

## Technical Details

### ClientDetail.tsx changes
- Modify the update call to include `.select()` so we get the updated row back:
  ```
  const { data, error } = await supabase
    .from("profiles")
    .update({ pricing_config: ..., custom_exchange_rate: ... })
    .eq("user_id", userId)
    .select();
  ```
- Check `data?.length` -- if 0 and no error, show "Update failed -- permission denied" toast.

### ClientList.tsx changes
- Add `useLocation()` from react-router-dom to detect route changes.
- Include `location.key` in the `useEffect` dependency array so the data reloads every time the user navigates to the page:
  ```
  const location = useLocation();
  useEffect(() => { load(); }, [location.key]);
  ```
