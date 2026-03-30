

## Plan: Payment Proof Upload + Account Selector for Client Deposits

### What We're Building

1. **Payment proof image upload** — Clients can attach a screenshot/photo when submitting a deposit request. The image is compressed client-side before uploading to save storage.
2. **Account selector** — Clients see and select which agency account they're paying into (e.g. "MD SABUJ MIAH (CITY)"), pulled from the `agency_accounts` table.

### Technical Approach

#### 1. Storage Bucket (Migration)
- Create a `payment-proofs` storage bucket (public read for admin viewing)
- Add RLS policies: clients can upload to their own folder, admins can read all
- Add `proof_image_url` column to `payment_requests` table
- Add `received_in_account_id` column is already present — no change needed there

#### 2. Client-Side Image Compression
- Use the browser Canvas API to compress images before upload (no extra dependency)
- Create a utility function `compressImage(file: File, maxWidth: number, quality: number): Promise<Blob>` that:
  - Reads the file into an Image element
  - Draws it onto a canvas at reduced dimensions (max 1200px wide)
  - Exports as JPEG at 0.7 quality (~70-80% size reduction)

#### 3. DepositFundsDialog Updates
- Add file input with preview thumbnail for payment proof
- On submit: compress → upload to `payment-proofs/{client_id}/{timestamp}.jpg` → save URL in `proof_image_url`
- Add account selector: fetch `agency_accounts` (name, type) and display as a dropdown so clients can pick which account they paid into (e.g. "MD SABUJ MIAH (CITY)")
- Save selected account in `received_in_account_id`

#### 4. RLS for Storage
- Client can INSERT into `payment-proofs/{their_user_id}/*`
- Admin can SELECT all files

#### 5. Admin Side (PaymentRequests.tsx)
- Show proof image thumbnail/link in the payment request review modal so admin can verify

### Files to Change
- **New migration**: Create bucket, add `proof_image_url` column, storage RLS policies
- **New file**: `src/lib/compressImage.ts` — Canvas-based compression utility
- **Edit**: `src/components/DepositFundsDialog.tsx` — Add image upload field, account selector, compression logic
- **Edit**: `src/pages/PaymentRequests.tsx` — Display proof image in approval modal

