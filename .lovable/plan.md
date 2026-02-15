
# Client Management Page with Detail View

## Overview
Create a dedicated **Client List** page and a **Client Detail** page where you can click on any client to view and edit their configuration, see their spend, payments, and transaction history -- all in one place.

## What Gets Built

### 1. Client List Page (`/admin/clients`)
A searchable table of all clients showing:
- Client name, business name, email
- Current balance (USD and BDT)
- Pricing model (Flat Rate / Percentage / Default)
- Custom exchange rate (if set)
- Clickable rows that navigate to the client detail page

### 2. Client Detail Page (`/admin/clients/:userId`)
A comprehensive single-client management page with these sections:

**Header Card**
- Client name, email, business name
- Current wallet balance with BDT equivalent

**Pricing Configuration (Editable)**
- Edit the per-platform dollar rates for Meta, TikTok, and Google (flat rate mode)
- Edit percentage markup (percentage mode)
- Switch between pricing modes (Default / Flat Rate / Percentage)
- Edit the client's custom exchange rate
- Save button to persist changes to the `profiles` table (`pricing_config` JSONB and `custom_exchange_rate`)

**Spend Summary**
- Total spend across all ad accounts for this client
- Breakdown by platform if data exists
- Pulled from `daily_ad_spend` joined through `ad_accounts` where `client_id` matches

**Payment Requests**
- Table of all `payment_requests` for this client (status, amount BDT, method, date, USD credited)

**Transaction History**
- Table of all `transactions` for this client (credits and debits, date, status, description)

### 3. Navigation Update
- Update AdminLayout sidebar: rename the existing "Clients" link (currently pointing to `/admin`) and add a new "Client List" entry pointing to `/admin/clients`
- Update `ClientOverviewTable` eye icon to link to `/admin/clients/:userId` instead of `/admin/clients`

## Technical Details

### New Files
- `src/pages/ClientList.tsx` -- the searchable client list
- `src/pages/ClientDetail.tsx` -- the single-client detail/edit page

### Modified Files
- `src/App.tsx` -- add routes `/admin/clients` and `/admin/clients/:userId`
- `src/components/AdminLayout.tsx` -- add "Client List" nav item
- `src/components/dashboard/ClientOverviewTable.tsx` -- update Eye icon link to `/admin/clients/${c.user_id}`

### Data Queries (Client Detail Page)
1. **Profile**: `profiles` table filtered by `user_id` (includes `pricing_config`, `custom_exchange_rate`)
2. **Spend**: `ad_accounts` where `client_id` matches, then `daily_ad_spend` for those account IDs
3. **Payment Requests**: `payment_requests` where `client_id` matches, ordered by `created_at desc`
4. **Transactions**: `transactions` where `client_id` matches, ordered by `created_at desc`

### Editing Logic
- Updates to `pricing_config` and `custom_exchange_rate` go through a direct `supabase.from("profiles").update(...)` call
- Admin RLS policy already grants full access to the profiles table
- No database schema changes needed -- all fields already exist

### Additional Features
- Search/filter on the client list (by name or business)
- Status badges on payment requests (Pending = yellow, Approved = green, Rejected = red)
- Transaction type badges (Credit = green, Debit = red)
- Quick action buttons: "Add Funds" and "View Payment Requests" links from the detail page
