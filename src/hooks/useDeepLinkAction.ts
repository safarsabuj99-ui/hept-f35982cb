import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

interface DeepLinkResult {
  highlightId: string | null;
  action: string | null;
  tab: string | null;
}

/**
 * Reads `highlight`, `action`, and `tab` from URL search params,
 * returns them once, and cleans the URL so back-button isn't polluted.
 */
export function useDeepLinkAction(): DeepLinkResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const consumed = useRef(false);

  const highlightId = searchParams.get("highlight");
  const action = searchParams.get("action");
  const tab = searchParams.get("tab");

  useEffect(() => {
    if (consumed.current) return;
    if (!highlightId && !action && !tab) return;

    consumed.current = true;
    // Clean up params after a short delay so consuming components can read them
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      next.delete("highlight");
      next.delete("action");
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }, 3000);

    return () => clearTimeout(timer);
  }, [highlightId, action, tab, searchParams, setSearchParams]);

  return { highlightId, action, tab };
}
