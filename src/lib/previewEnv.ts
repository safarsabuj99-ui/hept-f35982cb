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
  return (
    host.includes("lovableproject.com") ||
    host.includes("id-preview--") ||
    host.endsWith(".lovable.app")
  );
}

export function isPreviewEnv(): boolean {
  return isLovablePreviewHost() || isInIframe();
}
