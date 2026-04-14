

## Plan: Convert Two Existing Loan Entries to New Loan Tracking System

### Data Found

| # | Amount | Date | Note | Liquid Fund ID | Account ID |
|---|--------|------|------|---------------|------------|
| 1 | ৳29,000 | 2026-04-13 | "From arif. Total 50k" | `257619ec-...` | `c3787088-...` |
| 2 | ৳21,000 | 2026-04-09 | "From Arif" | `58794828-...` | `c3787088-...` |

Both from lender **Arif**, same account, same org, same creator.

### What Will Happen

One database migration that inserts two rows into `liquid_fund_loans`:

```text
Entry 1: ৳29,000 — lender "Arif", date 2026-04-13, note "From arif. Total 50k", status active
Entry 2: ৳21,000 — lender "Arif", date 2026-04-09, note "From Arif", status active
```

Both linked to their original `liquid_fund_entries` records so the data stays connected. After this, both loans will appear in the new **Loans tab** on Cash Flow with full return/repayment tracking.

### Files Changed
| Action | File |
|--------|------|
| Migration | Insert 2 rows into `liquid_fund_loans` from existing data |

No UI changes needed — the Loans tab already displays these records.

