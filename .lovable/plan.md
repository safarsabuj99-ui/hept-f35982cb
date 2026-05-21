## Goal
Stop the Lovable preview from reloading every 1–3 seconds without changing the published app behavior.

## What I found
- This does not look like an intentional app reload (`location.reload()` is not in the app).
- The preview host is repeatedly failing to load `/manifest.json` with `401`.
- Push/service-worker code is already mostly disabled in preview, so the remaining preview-only instability is likely the PWA bootstrap from `index.html`, not normal app routing.
- The issue appears specific to Lovable preview; published behavior should remain unchanged.

## Plan
1. Remove preview-host PWA bootstrap from the app shell.
   - Replace the static manifest link in `index.html` with a runtime-safe injection from `src/main.tsx`.
   - Only attach the manifest link on normal top-level hosts, never inside Lovable preview/iframe hosts.

2. Harden preview detection in startup code.
   - Centralize the preview-host check used by startup logic.
   - Reuse that check for manifest injection and any service-worker related startup gating so preview stays fully passive.

3. Keep published/PWA behavior intact outside preview.
   - Preserve manifest support and push/service-worker behavior on real app hosts.
   - Do not change auth flow, redirect URIs, or backend configuration.

4. Verify the exact preview symptom is gone.
   - Re-open `/admin` in Lovable preview.
   - Confirm there are no repeated `manifest.json` 401 loops and no repeated app mounts/reloads over the same waiting window.

## Technical details
- Files to update:
  - `index.html`
  - `src/main.tsx`
  - possibly `src/hooks/usePushNotifications.ts` if I factor the preview detection into shared startup logic
- I will keep the fix minimal and preview-specific so the live site still behaves like a PWA where supported.