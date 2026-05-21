import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Apply stored theme (default: dark)
const storedTheme = localStorage.getItem("theme");
if (storedTheme === "light") {
  document.documentElement.classList.remove("dark");
} else {
  document.documentElement.classList.add("dark");
  if (!storedTheme) localStorage.setItem("theme", "dark");
}

// Diagnostic: log every real document load so we can tell genuine reloads
// apart from in-app re-renders. Remove once reload-loop is confirmed gone.
try {
  const nav = (performance.getEntriesByType("navigation")[0]) as PerformanceNavigationTiming | undefined;
  const type = nav?.type ?? "unknown";
  // eslint-disable-next-line no-console
  console.info(`[App] mounted (nav type: ${type}) @ ${new Date().toISOString()} ${location.pathname}`);
} catch {}

// Inject PWA manifest ONLY on non-preview hosts. The Lovable preview host
// returns 401 for /manifest.json, which the browser logs repeatedly and can
// destabilize the preview iframe. Real published hosts get the manifest.
try {
  const host = window.location.hostname;
  const inIframe = window.self !== window.top;
  const isPreviewHost =
    host.includes("lovableproject.com") ||
    host.includes("id-preview--") ||
    host.endsWith("lovable.app");
  if (!isPreviewHost && !inIframe && !document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/manifest.json";
    document.head.appendChild(link);
  }
} catch {}

createRoot(document.getElementById("root")!).render(<App />);
