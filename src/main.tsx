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

createRoot(document.getElementById("root")!).render(<App />);
