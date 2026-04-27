import { useEffect, useState } from "react";

/**
 * Hides a fixed UI element when the user scrolls down and reveals it on
 * scroll up. Used by the mobile bottom search pill so it gets out of the way
 * while the user scans long lists / filter rows, then re-appears the moment
 * they nudge the page back up.
 *
 * - Listens to both `window` scrolls and capture-phase scrolls so nested
 *   scrollable panes also trigger updates.
 * - Uses a small downward delta threshold so micro-scrolls / momentum jitter
 *   don't flicker the pill.
 * - Always reveals near the top of the page. Caller can opt out via
 *   `enabled=false` (e.g. while keyboard is open or results are expanded).
 */
export function useHideOnScroll(opts?: {
  enabled?: boolean;
  /** Pixels of vertical movement required before flipping state. */
  threshold?: number;
  /** Don't hide until the page has been scrolled at least this far. */
  topGuard?: number;
}) {
  const enabled = opts?.enabled ?? true;
  const threshold = opts?.threshold ?? 8;
  const topGuard = opts?.topGuard ?? 64;
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }

    const getY = (target: EventTarget | null): number => {
      if (target && target instanceof HTMLElement) return target.scrollTop;
      if (target && target instanceof Document)
        return target.documentElement.scrollTop || window.scrollY || 0;
      return window.scrollY || document.documentElement.scrollTop || 0;
    };

    let lastY = getY(null);
    let ticking = false;

    const onScroll = (e: Event) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = getY(e.target);
        const delta = y - lastY;

        if (y <= topGuard) {
          setHidden(false);
          lastY = y;
        } else if (delta > threshold) {
          setHidden(true);
          lastY = y;
        } else if (delta < -threshold) {
          setHidden(false);
          lastY = y;
        }
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // Capture phase catches scrolls inside nested scroll containers too.
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [enabled, threshold, topGuard]);

  return hidden;
}
