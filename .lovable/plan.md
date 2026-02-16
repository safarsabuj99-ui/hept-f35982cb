

# Redesign Client Detail Page - Full Profile Management

## Overview

Redesign the Client Detail page to show all client information (account type, full name, email, phone, business name, mapping keyword, custom exchange rate, pricing model) in an editable format, with a clean modern layout.

## Current Issues
- Profile details (name, email, phone, business) are display-only in the header with no way to edit
- Account type (role) is not shown at all
- Mapping keyword is not visible or editable
- No password reset option
- Pricing and profile info are split awkwardly

## New Layout Design

### Header Section
- Back button + client name as page title
- Account type badge (Client/Manager) next to name
- "Add Funds" button stays in header area

### Tab Structure (6 tabs)
1. **Profile** (NEW - first tab) - All editable client details
2. **Pricing** - Pricing model configuration (existing)
3. **Ad Guard** - Automation config (existing)
4. **Spend** - Ad spend data (existing)
5. **Payments** - Payment requests (existing)
6. **Transactions** - Transaction history (existing)

### Profile Tab Design
A clean card-based form with grouped sections:

**Section 1: Account Info**
- Account Type (read-only badge showing Client/Manager)
- Full Name (editable input)
- Email (read-only, shown as text)
- Phone (editable input)
- Business Name (editable input)

**Section 2: Password**
- "Reset Password" button that triggers a password reset email via the `create-client` edge function or a new simple edge function

**Section 3: Mapping & Assignment**
- Mapping Keyword (editable input with helper text)
- Assigned Manager (dropdown selector - moved here from header)
- Custom Exchange Rate (editable input - moved here from Pricing tab)

All fields save together with a single "Save Changes" button at the bottom.

## Technical Changes

### File: `src/pages/ClientDetail.tsx`

1. **Add editable state** for `fullName`, `phone`, `businessName`, `mappingKeyword`
2. **Initialize from profile data** in the existing `loadAll` function
3. **New Profile tab** with form fields in a 2-column grid layout
4. **Move manager assignment** from header card into Profile tab
5. **Move exchange rate** into Profile tab (keep it in Pricing tab too or just Profile)
6. **Update `handleSave`** to include `full_name`, `phone`, `business_name`, `mapping_keyword` alongside pricing fields
7. **Add password reset** - a button that calls `supabase.auth.admin.resetPasswordForEmail()` via a small edge function or uses the existing auth reset flow
8. **Responsive design** - 2-column grid on desktop, stacked on mobile

### File: `supabase/functions/reset-client-password/index.ts` (NEW)
- Simple edge function that accepts `{ user_id, new_password }`
- Validates caller is admin
- Uses `supabase.auth.admin.updateUserById()` to set new password
- Returns success/error

### UI Polish
- Use icons next to section headers (User, Key, Settings icons)
- Read-only fields styled with muted background
- Account type shown as a colored badge
- Consistent spacing using the existing card/form patterns
- Tab count increases from 5 to 6 to accommodate the new Profile tab
