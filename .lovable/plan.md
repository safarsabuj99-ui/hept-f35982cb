

# Fix: Remove Left Border Line on Frozen Columns

## Problem
The table container at line 950 has `rounded-lg border` which draws a full border around the table. The **left border** creates a visible vertical line that clashes with the frozen column design — it looks like a misaligned divider (the red-marked line in your screenshot).

## Fix
In `DeepDiveTable.tsx` line 950, replace the uniform `border` with selective borders that exclude the left side, or use a different approach:

- Change the container from `border` to `border-t border-r border-b` (remove left border)
- OR better: keep `border` but set `border-left: none` so `rounded-lg` still works on other corners
- Apply `rounded-l-none` to avoid the rounded corner gap on the left

This is a single-line CSS class change on the table wrapper div.

## File
| File | Change |
|------|--------|
| `DeepDiveTable.tsx` (line 950) | Remove left border from table container |

