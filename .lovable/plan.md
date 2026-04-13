

## Plan: Delete Both Test Agencies and All Their Data

### Agencies to Delete
- **test1** (`fa196986-ccaa-40ee-abc0-7ea2531c8532`) — trial, user: `f7e8deb8-520e-4f43-b4ac-4205ef19080a`
- **test agency** (`ce4e84d4-9018-49a9-9a42-89781728117e`) — pending_payment, user: `a826a5cc-2e68-4bab-b989-0a914ed1bbae`

### What Gets Deleted
Using the database insert tool (which supports DELETE), remove all rows referencing these org IDs and user IDs across all tables, then delete the organizations and auth users.

**Deletion order** (respecting dependencies):
1. `notification_preferences`, `notifications`, `push_subscriptions` — by user_id
2. `subscription_payments`, `organization_subscriptions`, `subscription_invoices` — by org_id
3. `audit_logs` — by user_id
4. `user_roles` — by user_id
5. `profiles` — by user_id
6. `organizations` — by id
7. Auth users — deleted via `auth.users` (requires migration with `DELETE FROM auth.users`)

### Technical Approach
- Use the **insert tool** for data deletions (DELETE statements) across all affected tables
- Use a **migration** to delete from `auth.users` (since we can't modify auth schema via insert tool — we'll use a migration that deletes and commits)

### Safety
MD SABUJ MIAH Agency (`a1b2c3d4-e5f6-7890-abcd-ef1234567890`) is untouched — all queries filter by the two test org IDs only.

