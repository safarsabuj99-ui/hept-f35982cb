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

createRoot(document.getElementById("root")!).render(<App />);
