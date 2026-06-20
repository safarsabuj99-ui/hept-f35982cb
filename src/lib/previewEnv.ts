/**
 * Shared preview-environment detection.
 *
 * "Preview" means the Lovable in-editor preview iframe, which behaves
 * differently from a real published host: cross-origin parent, restricted
 * permissions, and aggressive HMR. Any code that touches service workers,
 * manifests, push, or other top-level browser APIs must short-circuit on
 * preview to avoid lifecycle loops that look like 1–3s auto-reloads.
 */
export function isInIframe(): boolean {
  try {
    return typeof window !== "undefined" && window.self !== window.top;
  } catch {
    // Cross-origin access throws — that itself means we're in an iframe.
    return true;
  }
}

export function isLovablePreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  // Real Lovable preview / sandbox hosts only. The published *.lovable.app
  // host (e.g. hept.lovable.app) is PRODUCTION and must NOT be treated as
  // preview — doing so tears down the service worker that delivers push
  // notifications when the app is closed.
  return (
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovableproject-dev.com") ||
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  );
}

export function isPreviewEnv(): boolean {
  return isLovablePreviewHost() || isInIframe();
}
