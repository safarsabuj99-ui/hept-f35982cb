import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface RenderResultsArgs {
  query: string;
  close: () => void;
}

export interface MobileSearchPillProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Class applied to the desktop inline input wrapper. */
  className?: string;
  /** Class applied to the desktop <Input>. */
  inputClassName?: string;
  /** Optional preview content shown above the pill on mobile when expanded. */
  renderResults?: (args: RenderResultsArgs) => ReactNode;
  /** ARIA label / dialog title (screen-reader). */
  label?: string;
  /** Disable the entire control. */
  disabled?: boolean;
  /** Override the default icon. */
  icon?: ReactNode;
}

/**
 * Single-instance registry. Ensures only the most-recently mounted pill
 * is the visible one when multiple consumer components live on the same page.
 */
let pillCounter = 0;
const activeIds = new Set<number>();
const subscribers = new Set<() => void>();
function notify() {
  subscribers.forEach((cb) => cb());
}
function useIsTopPill(id: number) {
  const [isTop, setIsTop] = useState(() => Math.max(...Array.from(activeIds), 0) === id);
  useEffect(() => {
    const cb = () => setIsTop(Math.max(...Array.from(activeIds), 0) === id);
    subscribers.add(cb);
    cb();
    return () => {
      subscribers.delete(cb);
    };
  }, [id]);
  return isTop;
}

/**
 * One UI 8.5-style search field.
 *
 * - Desktop / tablet (≥768px): renders a regular inline <Input> identical to
 *   the existing pattern. No visual change vs. the legacy markup.
 * - Mobile (<768px): the inline input is hidden entirely; instead a fixed
 *   pill-shaped search bar is rendered via portal at the bottom of the
 *   viewport, always visible and ready to type into without any extra tap.
 *   Tapping it expands an upward-stacking results panel when `renderResults`
 *   is provided.
 */
export function MobileSearchPill({
  value,
  onChange,
  placeholder = "Search…",
  className,
  inputClassName,
  renderResults,
  label,
  disabled,
  icon,
}: MobileSearchPillProps) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // Register this pill in the global single-instance registry (mobile only).
  const idRef = useRef<number>(0);
  if (idRef.current === 0) idRef.current = ++pillCounter;
  const id = idRef.current;
  useEffect(() => {
    if (!isMobile) return;
    activeIds.add(id);
    notify();
    return () => {
      activeIds.delete(id);
      notify();
    };
  }, [id, isMobile]);
  const isTopPill = useIsTopPill(id);

  // Track on-screen keyboard via visualViewport so the pill stays above it.
  useEffect(() => {
    if (!isMobile) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [isMobile]);

  // Auto-collapse the results panel when value clears.
  useEffect(() => {
    if (!value) setExpanded(false);
  }, [value]);

  // ─── Desktop ──────────────────────────────────────────────────────────────
  if (!isMobile) {
    const Icon = (
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
        {icon ?? <Search className="h-4 w-4" />}
      </span>
    );
    return (
      <div className={cn("relative", className)}>
        {Icon}
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("pl-9", inputClassName)}
          aria-label={label ?? placeholder}
        />
      </div>
    );
  }

  // ─── Mobile ───────────────────────────────────────────────────────────────
  // The inline slot collapses to nothing — pages keep their layout intact
  // because the original spot was already a small input, and we don't want
  // any visible inline trigger.
  if (!isTopPill || disabled) {
    // Inactive duplicate (or disabled): render nothing inline AND nothing fixed.
    return null;
  }

  const close = () => setExpanded(false);

  const pill = (
    <div
      className="fixed left-0 right-0 z-40 px-3 pointer-events-none"
      style={{
        bottom: keyboardOffset > 0
          ? `calc(${keyboardOffset}px + 0.5rem)`
          : `calc(env(safe-area-inset-bottom, 0px) + var(--mobile-bottom-offset, 4.5rem))`,
        transition: "bottom 180ms cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      <div className="mx-auto w-full max-w-md flex flex-col gap-2 pointer-events-auto">
        {/* Results panel — only when expanded AND consumer provides renderResults */}
        {expanded && renderResults && (
          <div
            className={cn(
              "max-h-[60vh] overflow-y-auto rounded-3xl border border-border/40",
              "bg-card/95 backdrop-blur-2xl shadow-[0_-12px_40px_-12px_hsl(var(--primary)/0.35)]",
              "px-1 py-2 animate-in fade-in-0 slide-in-from-bottom-2",
            )}
          >
            {renderResults({ query: value, close })}
          </div>
        )}

        {/* The pill — persistent, always visible */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-full border border-border/60",
            "bg-card/95 backdrop-blur-2xl px-3 h-14",
            "shadow-[0_8px_32px_-8px_hsl(var(--primary)/0.35),0_-2px_12px_-4px_hsl(var(--foreground)/0.08)]",
          )}
        >
          <Search className="h-4 w-4 shrink-0 text-primary/70" />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => renderResults && setExpanded(true)}
            placeholder={placeholder}
            aria-label={label ?? placeholder}
            className="flex-1 min-w-0 bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground/60 placeholder:font-normal"
          />
          {value ? (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground transition"
            >
              <X className="h-4 w-4" />
            </button>
          ) : expanded && renderResults ? (
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="rounded-full px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Done
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(pill, document.body) : null;
}
