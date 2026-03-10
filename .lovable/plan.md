

## TikTok Business Center Integration — What Needs to Change

### The Problem

Your current TikTok discovery function (`auto-import-accounts`) expects **comma-separated advertiser IDs** in the App ID field. But with a Business Center, you don't know the advertiser IDs upfront — you need to **discover them from the BC ID first**.

### What I'll Change

**1. Update the `auto-import-accounts` edge function** — Modify `fetchTikTokAccounts()` to:
- First call `GET /open_api/v1.3/bc/advertiser/get/` with the BC ID to discover all advertiser IDs under the Business Center
- Then call `/open_api/v1.3/advertiser/info/` with those discovered IDs to get account details
- Handle pagination (TikTok returns max 100 per page)

**2. Update the `test-connection` edge function** — Change the TikTok test to validate using the BC endpoint (`/open_api/v1.3/bc/info/`) instead of the user info endpoint, confirming BC access and showing BC name.

**3. Update the TikTok setup guide** in the Integrations page — Replace the outdated steps with the correct OAuth flow:
- Step 1: Open your Advertiser Authorization URL and click Confirm
- Step 2: Copy the `auth_code` from the redirect URL
- Step 3: Exchange for a long-lived token (via a new edge function)
- App ID = Business Center ID

**4. Create a `tiktok-exchange-token` edge function** — A new function that:
- Accepts `auth_code`, `app_id`, and `app_secret`
- Calls TikTok's `POST /open_api/v1.3/oauth2/access_token/` to exchange for a long-lived token
- Returns the token so it can be saved to the integration

**5. Add a "TikTok OAuth" button** in the Add Instance dialog — When TikTok is selected, show an additional field for auth code and a button to exchange it for a token automatically.

### What You Need to Provide

- **App Secret** from TikTok Developer Portal (My Apps → HEPT → Basic Information) — I'll securely store this as a backend secret
- **Business Center ID**: `7602648217663048705` (already known)
- **Auth Code**: `3a8695d6afe8d5124284d252b079d66f783ab2b4` (already captured, but these expire in ~10 minutes, so we'll need a fresh one when ready)

### Step-by-Step After Implementation

1. I store your TikTok App Secret securely in the backend
2. You go to Integrations → Add Instance → TikTok
3. Enter Instance Name: "HEPT AGENCY"
4. Enter App ID (BC ID): `7602648217663048705`
5. Open the authorization URL, click Confirm, paste the auth code
6. Click "Exchange Token" — system auto-generates the long-lived token
7. Go to Ad Accounts → Sync from API — all accounts under your BC are discovered automatically

