

# Digital Marketing Client Portal — Implementation Plan

## Overview
A secure, mobile-first client portal for a digital marketing agency to manage ad spend across Meta, TikTok, and Google Ads. Admins manage all clients and transactions; clients see only their own data.

---

## 1. Authentication & Roles
- **Supabase Auth** for login (email/password)
- **Admin creates client accounts** — an admin-only form to register new clients (creates auth user + profile)
- **Roles stored in a separate `user_roles` table** (not on profiles) using a security-definer helper function to prevent privilege escalation and RLS recursion
- Login page routes users to the correct dashboard based on their role

## 2. Database Design (Supabase)
- **`profiles`** — user_id, full_name, email, phone, business_name, created_at
- **`user_roles`** — user_id, role (enum: 'admin', 'client')
- **`transactions`** — id, client_id, type (credit/debit), amount, platform (nullable — meta/tiktok/google, only for debits), description, date, created_at, created_by
- **Balance** is calculated dynamically: `SUM(credits) - SUM(debits)` per client
- RLS policies ensure clients can only read their own profile and transactions; admins have full access

## 3. Admin Dashboard
- **Client list** with real-time calculated balances
- **Add Funds form** — select client, enter amount & date → creates a "credit" transaction
- **Log Daily Spend form** — select client, select platform (Meta / TikTok / Google), enter amount & date → creates a "debit" transaction
- **Client management** — add new client accounts (name, email, phone, business, password)
- Success toast notifications on all actions

## 4. Client Dashboard
- **Summary cards:**
  - Current Balance (large, prominent)
  - Total Spent to date
  - Last Updated timestamp
- **Platform Breakdown:**
  - Donut chart showing percentage split across Meta, TikTok, Google
  - Bar chart showing spend amounts per platform (with daily trend option)
- **Transaction History** — table of all credits (deposits) and debits (spends) with date, type, platform, and amount

## 5. Design & UX
- **Blue/Indigo professional theme** applied to the Shadcn design tokens
- **Fully responsive** — optimized for mobile-first viewing (cards stack, tables scroll horizontally)
- **Shadcn UI components** — cards, tables, forms, selects, dialogs, toasts
- Clean navigation: sidebar on desktop, bottom nav or hamburger on mobile

## 6. Pages & Routing
| Route | Access | Description |
|-------|--------|-------------|
| `/login` | Public | Login page |
| `/admin` | Admin only | Admin dashboard with client list |
| `/admin/clients/new` | Admin only | Create new client account |
| `/admin/add-funds` | Admin only | Add funds form |
| `/admin/log-spend` | Admin only | Log daily spend form |
| `/dashboard` | Client only | Client's personal dashboard |

## 7. Security
- RLS on all tables — clients see only their own data
- Role checks via security-definer function (no recursive RLS)
- Input validation with Zod on all forms
- Protected routes with auth guards

