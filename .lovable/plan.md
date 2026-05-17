## Goal

Fully reverse the **May 17 ৳5,000 Bank deposit** for **Akram Ahmed (Our's Heritage)** so that every number it affected goes back to what it was before approval. No UI changes — backend data only.

## Target record (confirmed)

| Field | Value |
|---|---|
| Payment request | `0a751007-37e0-4ae9-9d7e-0d8125a71f81` |
| Client | Akram Ahmed (`6385b339-394b-4970-b807-683500b60af0`) — Our's Heritage |
| Method | Bank · Platform TikTok · ৳5,000 |
| Rate / Credited | ৳145 → **$34.48** |
| Payment date | 2026-05-14 (created 2026-05-17) |
| Agency account credited | `c3787088…1162c` — *MD SABUJ MIAH (CITY)*, balance **৳96,712.76** |
| Linked wallet transaction | `d0e70e0c-f487-4cee-84fa-efb6645ec5e9` (credit $34.48, completed) |

## What this approval changed

1. `payment_requests` row → status `approved`, `final_amount_usd 34.48`, snapshot `{tiktok:145}`, `received_in_account_id` set.
2. `transactions` row → +$34.48 credit (TikTok) to the client's wallet.
3. `agency_accounts.current_balance_bdt` for *MD SABUJ MIAH (CITY)* → +৳5,000 (no trigger; updated in code).
4. `audit_logs` → one `payment_approved` row + one `funds_added` row.

Everything else (admin dashboard collections, client wallet, USD inventory, P&L cash-flow KPIs, ClientDetail history) is **computed live** from those four rows, so reversing them automatically corrects every downstream number — no extra writes needed.

## Rollback steps (single migration / data ops, in order)

```text
1.  DELETE FROM transactions
      WHERE id = 'd0e70e0c-f487-4cee-84fa-efb6645ec5e9';
        -- removes $34.48 from client wallet + dashboard collections-USD

2.  UPDATE agency_accounts
      SET current_balance_bdt = current_balance_bdt - 5000
      WHERE id = 'c3787088-a635-45f3-b48c-6ba72d01162c';
        -- restores bank account balance to ৳91,712.76

3.  DELETE FROM payment_requests
      WHERE id = '0a751007-37e0-4ae9-9d7e-0d8125a71f81';
        -- removes the row entirely (per "permanent delete" choice)

4.  Optional cleanup (recommended for clean audit):
    DELETE FROM audit_logs
      WHERE description LIKE 'Approved payment ৳5,000 → $34.48%for client 6385b339-394b-4970-b807-683500b60af0%'
         OR description LIKE 'Deposit $34.48 (status: completed)';
    -- limit to rows created within ~1 min of 2026-05-17 02:42 to avoid touching unrelated logs.
```

All four ops run as one batch via the data-mutation tool.

## Verification (after rollback)

- Akram Ahmed wallet TikTok balance drops by **$34.48**.
- *MD SABUJ MIAH (CITY)* bank balance shows **৳91,712.76**.
- `/admin/payment-requests` no longer lists this May 17 row.
- Admin dashboard collections, P&L revenue, Cash-flow recent activity, and client portal Payment Requests list all auto-refresh (realtime is subscribed) and reflect the reversed totals.

## Notes / risks

- This is **destructive and permanent** (your chosen option). No code-side undo button.
- The other 7 similar ৳5,000 Akram Ahmed rows are **not touched**.
- No frontend code changes are required.
