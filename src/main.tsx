import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { isPreviewEnv } from "./lib/previewEnv";

// Apply stored theme (default: dark)
const storedTheme = localStorage.getItem("theme");
if (storedTheme === "light") {
  document.documentElement.classList.remove("dark");
} else {
  document.documentElement.classList.add("dark");
  if (!storedTheme) localStorage.setItem("theme", "dark");
}

const PREVIEW = isPreviewEnv();

// Diagnostic: log every real document load so we can tell genuine reloads
// apart from in-app re-renders.
try {
  const nav = (performance.getEntriesByType("navigation")[0]) as PerformanceNavigationTiming | undefined;
  const type = nav?.type ?? "unknown";
  // eslint-disable-next-line no-console
  console.info(`[App] mounted (nav type: ${type}, preview: ${PREVIEW}) @ ${new Date().toISOString()} ${location.pathname}`);
} catch {}

if (PREVIEW) {
  // Preview-only cleanup: an earlier build may have registered a service
  // worker against the preview origin. Once registered, the SW keeps
  // controlling the page across reloads and can drive a 1–3s reload loop
  // when its activation/update cycle races with the preview iframe.
  // Aggressively tear it down — without navigating — so the next mount is
  // fully passive. This runs only inside the Lovable preview/iframe and
  // never on real published hosts.
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          regs.forEach((r) => {
            r.unregister().catch(() => {});
          });
        })
        .catch(() => {});
    }
    if (typeof caches !== "undefined" && caches?.keys) {
      caches
        .keys()
        .then((names) => Promise.all(names.map((n) => caches.delete(n).catch(() => false))))
        .catch(() => {});
    }
  } catch {}
} else {
  // Real host: inject PWA manifest if not already present. Skipped in
  // preview to avoid repeated 401s on /manifest.json.
  try {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/manifest.json";
      document.head.appendChild(link);
    }
  } catch {}
}

createRoot(document.getElementById("root")!).render(<App />);
