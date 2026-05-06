## Show Net BDT (after MFS fee) in Per-Platform Rates

### Problem
In the approval modal, the **Per-Platform Rates** row currently shows the **gross BDT** (e.g. ৳2,000) even after the MFS fee is applied. This is confusing — the USD on the right is correctly calculated from the net amount, but the BDT shown does not match.

Example: Gross ৳2,000, fee 0.85% → Net ৳1,983. Row shows `Tiktok ৳2,000 ÷ 150 = $13.22` but math is actually `1983 / 150 = $13.22`.

### Fix
Update the per-platform row in the approval modal to display the **net BDT** (after fee deduction) instead of the gross BDT, so the math reads naturally:

`Tiktok ৳1,983 ÷ 150 = $13.22`

### Changes
- **File:** `src/pages/PaymentRequests.tsx` (around line 879)
- Replace the displayed `৳{Number(bdtAmount).toLocaleString()}` with the net amount: `৳{netForPlatform.toLocaleString(...)}`.
- When `effectiveFeePct > 0`, also show the gross struck-through next to it (small muted text) so the admin still sees the original amount.
- No backend / edge function changes — calculation already uses net.

### Optional polish
- In the Total Credit row, briefly show `Net ৳X,XXX → $YY.YY` for clarity when MFS fee > 0.
