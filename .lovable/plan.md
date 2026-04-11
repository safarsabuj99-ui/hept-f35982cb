

## Fix: Overflow Text in Client & Ad Account Filter Controls

**Problem:** The label text ("Client", "Ad Account") and the filter button text overflow on the campaigns page, especially when long client names or ad account names are selected.

### File: `src/pages/CampaignMapping.tsx`

**Changes:**

1. **Client filter button (line 266):** Add `truncate` and `min-w-0` classes so long client names get ellipsized instead of overflowing. Wrap the text in a `<span className="truncate">` to ensure it clips properly while the chevron icon stays visible.

2. **Ad Account filter button (line 313):** Same treatment — add `truncate` on the text span and `min-w-0` on the button container so long account names don't push the layout.

3. **Filter container divs (lines 258, 305):** Add `min-w-0` to both wrapper divs so they respect the flex parent's boundaries and don't overflow.

4. **Button text spans:** Wrap the dynamic text (client name / ad account name) in `<span className="truncate block">` so CSS text-overflow ellipsis works correctly, keeping the chevron icon always visible at the right edge.

### No backend or database changes needed — purely CSS/layout fix.

