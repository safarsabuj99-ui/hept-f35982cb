import { useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

interface Options {
  /** Disable the listener (e.g. when popup is already open). */
  disabled?: boolean;
  /** Max ms between taps to count as double-tap. */
  maxDelay?: number;
  /** Max distance (px) between taps. */
  maxDistance?: number;
  /** Cooldown after firing, prevents rapid re-fire. */
  cooldown?: number;
}

const INTERACTIVE_SELECTOR =
  'input, textarea, select, button, a, [role="button"], [role="menuitem"], [role="option"], [contenteditable="true"], [data-no-double-tap]';

/**
 * Smart double-tap gesture for mobile.
 *
 * Fires `onDoubleTap` when the user taps twice quickly on a non-interactive
 * area of the page. Designed so that tapping real controls (buttons, inputs,
 * the bottom search pill) never accidentally triggers it.
 */
export function useDoubleTapGesture(
  onDoubleTap: () => void,
  { disabled, maxDelay = 300, maxDistance = 40, cooldown = 600 }: Options = {},
) {
  const isMobile = useIsMobile();
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const cooldownUntilRef = useRef(0);

  useEffect(() => {
    if (!isMobile || disabled) return;

    const handler = (e: PointerEvent) => {
      // Touch / pen only — ignore mouse so desktop double-clicks are unaffected.
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;

      const target = e.target as Element | null;
      if (target && target.closest && target.closest(INTERACTIVE_SELECTOR)) {
        lastTapRef.current = null;
        return;
      }

      const now = performance.now();
      if (now < cooldownUntilRef.current) return;

      const last = lastTapRef.current;
      const x = e.clientX;
      const y = e.clientY;

      if (
        last &&
        now - last.t <= maxDelay &&
        Math.hypot(x - last.x, y - last.y) <= maxDistance
      ) {
        lastTapRef.current = null;
        cooldownUntilRef.current = now + cooldown;
        try {
          navigator.vibrate?.(10);
        } catch {
          /* ignore */
        }
        onDoubleTap();
      } else {
        lastTapRef.current = { t: now, x, y };
      }
    };

    document.addEventListener("pointerdown", handler, { passive: true });
    return () => document.removeEventListener("pointerdown", handler);
  }, [isMobile, disabled, onDoubleTap, maxDelay, maxDistance, cooldown]);
}
