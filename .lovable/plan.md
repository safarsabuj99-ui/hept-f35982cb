## Goal

On **mobile only**, every search box in the agency app (not just ⌘K) behaves like a **One UI 8.5 bottom pill** — tapping the inline search field opens a full-screen sheet with the actual search input pinned to the bottom (within thumb reach, above the keyboard) and the results scrolling **upward** above it. Desktop / tablet behaviour stays exactly as it is today.

## Why one shared primitive (instead of editing 14 places)

There are 14+ search inputs across the app:

- `ClientList`, `AdAccounts`, `PaymentRequests`, `OrderManagement`, `TeamManagement`, `TeamMemberDetail` (×2), `AgencyList`, `Notifications`, `DeepDiveTable`, `CampaignMapping` (×2), `ClientDetail`, `AdAccountDetail`.

If each is rewritten ad-hoc the look will drift and future searches won't get the treatment. We'll ship one primitive and migrate every site to it. Single source of truth, consistent feel everywhere.

## Approach

### 1. New primitive: `<MobileSearchPill>`

Create `src/components/ui/mobile-search-pill.tsx`. Two-mode wrapper around a regular text input:

- **Desktop (≥768px)** → renders the existing inline `<Input>` with the same `placeholder`, `value`, `onChange`, and left search icon. **Zero visual change.**
- **Mobile (<768px)** → renders a *trigger* that looks the same as today's inline search (placeholder + icon, slightly pill-rounded). Tapping it opens a bottom-sheet `<Dialog>`:
  - Backdrop: `bg-background/60 backdrop-blur-sm`.
  - Sheet container: `fixed inset-x-2 bottom-2 top-auto`, slide-up animation.
  - **Results panel** above (`flex-1`, `max-h-[70vh]`, scrolls). The page passes its own results renderer (see API).
  - **Pill bar** pinned at bottom: `rounded-full h-14`, `bg-card/95 backdrop-blur-2xl`, soft border, large drop shadow `shadow-[0_-8px_32px_-8px_hsl(var(--primary)/0.35)]`, `pb-[env(safe-area-inset-bottom)]`. Left = search icon, center = real text input (auto-focused), right = clear (✕) when query non-empty.
  - Tapping backdrop or pressing Escape closes.

Detection uses the existing `useIsMobile()` hook (768px breakpoint).

### 2. API — minimal & flexible

```tsx
<MobileSearchPill
  value={search}
  onChange={setSearch}
  placeholder="Search by name, business, or email…"
  className="w-full sm:max-w-sm"             // styling for the desktop inline input
  // Optional: live results preview rendered above the pill on mobile
  renderResults={({ query, close }) => (
    <YourFilteredList query={query} onPick={() => close()} />
  )}
/>
```

If `renderResults` is omitted (good for table-filter pages like ClientList where the table itself is the result), the sheet just shows a hint (“Type to filter…”). Closing the sheet keeps the typed value so the underlying page list reflects the filter — exactly like today.

### 3. Refactor the existing global ⌘K popup

`ClientSearchCommand.tsx` already has its own custom dialog. Apply the **same bottom-pill layout** there on mobile (without using `MobileSearchPill` directly — it has bespoke result groups). Reuse the same shell styling tokens (pill height, shadow, blur, safe-area padding) so the entire app feels coherent.

### 4. Migrate the 14 sites

Replace each `<div.relative><Search/><Input placeholder="Search…" /></div>` block with `<MobileSearchPill … />`. Same `value` / `onChange` wiring, no behaviour change for desktop. For the 4 popover-driven `CommandInput` usages (`CampaignMapping` ×2, `ClientDetail`, `AdAccountDetail`), they already open a popover so we’ll add a small mobile branch that renders the popover’s `Command` content inside the bottom-sheet shell with the input pinned to the bottom.

### 5. Animation & polish

- Use existing `animate-slide-up-fade` / fade-out tokens for the sheet entrance.
- Backdrop fades via Radix Dialog defaults.
- Tactile press feedback on the pill (`active:scale-[0.98]`).
- Respect `prefers-reduced-motion`.

### 6. What does NOT change

- Desktop and tablet (≥768px) layouts are byte-identical to today.
- All filter logic, query state, debouncing, and pagination remain on the host pages.
- No DB / RPC / route changes.

## Files

- **NEW** `src/components/ui/mobile-search-pill.tsx` — the shared primitive.
- **EDIT** `src/components/dashboard/ClientSearchCommand.tsx` — apply the same bottom-pill layout on mobile.
- **EDIT (one-line swap each)**: `src/pages/ClientList.tsx`, `src/pages/AdAccounts.tsx`, `src/pages/PaymentRequests.tsx`, `src/pages/OrderManagement.tsx`, `src/pages/TeamManagement.tsx`, `src/pages/TeamMemberDetail.tsx`, `src/pages/AgencyList.tsx`, `src/pages/Notifications.tsx`, `src/components/client-analytics/DeepDiveTable.tsx`.
- **EDIT (popover-mode branch)**: `src/pages/CampaignMapping.tsx`, `src/pages/ClientDetail.tsx`, `src/pages/AdAccountDetail.tsx`.

No DB / migration / RPC changes. No desktop regressions.

## Result

Mobile users get a consistent One UI 8.5-style search experience across the **entire** agency app: tap any search field → bottom pill above the keyboard → results stack upward → thumb-reachable. Desktop stays premium and centered as before.
