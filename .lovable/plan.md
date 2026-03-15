

## Plan: Register Existing Agency in SaaS Management

The admin user `raohas10@gmail.com` (MD SABUJ MIAH, user_id: `d66027e0-9056-43f7-bb4c-b7e30f683182`) exists with role `admin` and `is_super_admin=true`, but:
- `org_id` is `NULL` — no organization linked
- The `organizations` table is empty — no agencies exist yet

### Steps

1. **Create organization record** via database migration:
   - Insert into `organizations` with `owner_user_id` = the existing admin user ID
   - Set plan to `starter`, status to `active`, reasonable defaults for limits

2. **Link admin profile to organization**:
   - Update `profiles` set `org_id` = the new org ID for user `d66027e0-9056-43f7-bb4c-b7e30f683182`

3. **Create a subscription record**:
   - Insert into `organization_subscriptions` to track the agency's billing

This is a data-only change — no code modifications needed. The existing Platform Owner UI will immediately show the agency in the Agencies list.

