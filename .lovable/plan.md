

## Multi-Platform Deposit Funds

### What Changes

Currently, both the `DepositFundsDialog` (client-facing) and `AddFunds` page (admin-facing) only allow selecting **one platform** per deposit. The user wants clients to specify amounts for **multiple platforms** (Meta, TikTok, Google) in a single deposit request.

### Approach

Since the `payment_requests` table has a single `platform` (text) and `amount_bdt` (numeric) column, the cleanest approach is to add a new JSONB column `platform_amounts` that stores per-platform breakdown, e.g.:
```json
{"meta": 5000, "tiktok": 3000, "google": 0}
```

The existing `platform` and `amount_bdt` columns continue to work (backward compatible). When `platform_amounts` is set, `amount_bdt` becomes the **total** and `platform` can be set to `"multi"` or left null.

### Database Migration

- Add column `platform_amounts jsonb default null` to `payment_requests`
- No RLS changes needed (same policies apply)

### UI Changes — `DepositFundsDialog.tsx`

Replace the single platform dropdown + single amount input with:
- **Platform amount rows**: Three inline rows for Meta, TikTok, Google, each with a checkbox toggle and amount input
- Only enabled platforms require an amount
- Auto-calculated total displayed below
- At least one platform must be selected with amount > 0

```text
Platform Amounts
┌──────────────────────────────────┐
│ ☑ Meta         ৳ [  5,000.00  ] │
│ ☑ TikTok       ৳ [  3,000.00  ] │
│ ☐ Google       ৳ [     0.00   ] │
├──────────────────────────────────┤
│ Total:                ৳ 8,000.00│
└──────────────────────────────────┘
```

On submit:
- `amount_bdt` = sum of all platform amounts
- `platform_amounts` = `{ meta: 5000, tiktok: 3000 }` (only non-zero)
- `platform` = single platform key if only one selected, otherwise `null`

### UI Changes — `AddFunds.tsx` (Admin)

Same multi-platform pattern: allow admin to specify per-platform USD amounts when adding funds. On submit, create **separate transaction rows per platform** (since `transactions.platform` is an enum and each transaction tracks one platform's balance). This preserves wallet sub-balance integrity.

### Admin Approval Side

When admin views/approves a multi-platform payment request, the `platform_amounts` JSON will show the breakdown. The approval flow (in `approve-payment` edge function or wherever it lives) will need to create one transaction per platform entry.

### Files Modified

| File | Change |
|---|---|
| **New migration** | Add `platform_amounts jsonb` to `payment_requests` |
| `src/components/DepositFundsDialog.tsx` | Multi-platform amount inputs replacing single platform+amount |
| `src/pages/AddFunds.tsx` | Multi-platform amount inputs, create per-platform transactions |
| `supabase/functions/approve-payment/index.ts` | Handle `platform_amounts` to create per-platform transactions on approval |

