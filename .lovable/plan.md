## Goal
Stop the Lovable preview from reloading every 1–3 seconds while keeping the real app behavior unchanged.

## What I found
- The sandbox Vite server is stable; it is not crashing or restarting.
- In a fresh browser session, the preview does not continuously hard-reload on its own.
- Your recording matches a preview-only loop, which strongly suggests stale service-worker state left behind from earlier PWA/bootstrap behavior inside the preview environment.
- The app already has partial preview guards, but it does not actively clean up old preview registrations/controllers that may still be attached from earlier visits.

## Plan
1. Centralize preview-environment detection.
   - Create one shared helper for “Lovable preview or iframe” checks.
   - Reuse it from startup and push-notification code so preview behavior is consistent.

2. Add a preview-only service-worker cleanup pass.
   - On Lovable preview hosts only, actively unregister any existing service workers and remove related caches.
   - Keep the cleanup isolated to preview so published/installable behavior is not affected.

3. Keep preview fully passive after cleanup.
   - Prevent any manifest/service-worker startup path from reactivating inside preview.
   - Leave normal hosts unchanged so the live app still supports its current install/push behavior.

4. Verify against the exact symptom.
   - Re-open `/admin` in preview and wait through the previous 1–3 second loop window.
   - Confirm there is no repeated document remount and no bounce back caused by stale preview state.

## Technical details
- Files likely to update:
  - `src/main.tsx`
  - `src/hooks/usePushNotifications.ts`
  - optionally a tiny shared utility for preview detection
- I will avoid auth/config changes and keep the fix scoped to preview runtime cleanup only.