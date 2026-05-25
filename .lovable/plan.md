## Goal

Make the **Carry Forward amount editable** in the USD Inventory "Close Period & Reset" dialog (currently it is a fixed display of the current balance).

## Changes to `src/pages/WalletInventory.tsx`

1. Add state: `const [closeCarryAmount, setCloseCarryAmount] = useState("")`.
2. When the `closePeriodDialogOpen` dialog opens, prefill `closeCarryAmount` with `overview.availableBalance` (default unchanged behavior).
3. Replace the static balance display inside the dialog with an **editable number Input** (USD), label "Carry Forward Balance", with helper text: *"Defaults to current available balance — edit if you want to manually set the carry-forward."*
4. In `handleClosePeriod`:
   - Parse `Number(closeCarryAmount)`; validate it's a finite number ≥ 0.
   - Insert `balance_usd: parsedCarry` instead of `overview.availableBalance`.
   - Update success toast and the default notes string to use the edited value.
5. Reset `closeCarryAmount` after successful close.

No DB/schema change. No effect on the auto-snapshot or opening-balance flow.