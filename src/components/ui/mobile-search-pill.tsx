import { useEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
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
  /** Optional preview content shown above the pill on mobile. */
  renderResults?: (args: RenderResultsArgs) => ReactNode;
  /** Called once when the mobile sheet opens. Useful to focus / load data. */
  onOpen?: () => void;
  /** ARIA label / dialog title (screen-reader). */
  label?: string;
  /** Disable the entire control. */
  disabled?: boolean;
  /** Override the default icon. */
  icon?: ReactNode;
}

/**
 * One UI 8.5-style search field.
 *
 * - Desktop / tablet (≥768px): renders a regular inline <Input> identical to
 *   the existing pattern (icon on the left, input on the right). No visual
 *   change vs. the legacy markup.
 * - Mobile (<768px): renders a "pill trigger" that opens a bottom-sheet with
 *   the actual search input pinned to the bottom (above the keyboard) and
 *   results stacked above. Closing the sheet keeps the typed value so
 *   filter-driven pages keep working unchanged.
 */
export function MobileSearchPill({
  value,
  onChange,
  placeholder = "Search…",
  className,
  inputClassName,
  renderResults,
  onOpen,
  label,
  disabled,
  icon,
}: MobileSearchPillProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    onOpen?.();
    // Slight delay lets the sheet finish mounting before focusing — prevents
    // Android keyboard from racing the slide-up animation.
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const Icon = (
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
      {icon ?? <Search className="h-4 w-4" />}
    </span>
  );

  // Desktop: identical to the existing inline pattern.
  if (!isMobile) {
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

  const close = () => setOpen(false);

  // Mobile trigger — looks like the inline input but opens the sheet on tap.
  return (
    <>
      <div className={cn("relative", className)}>
        {Icon}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          aria-label={label ?? placeholder}
          className={cn(
            "flex h-10 w-full items-center rounded-md border border-input bg-background pl-9 pr-3 text-left text-sm text-muted-foreground transition-all duration-200 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50",
            value && "text-foreground",
            inputClassName,
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          {value && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear search"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </div>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          />
          <DialogPrimitive.Content
            onOpenAutoFocus={(e) => e.preventDefault()}
            className={cn(
              "fixed inset-x-2 bottom-2 z-50 flex flex-col gap-2 outline-none",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-2",
              "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
            )}
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <VisuallyHidden>
              <DialogPrimitive.Title>{label ?? placeholder}</DialogPrimitive.Title>
            </VisuallyHidden>

            {/* Results panel — scrolls upward from above the pill */}
            {renderResults ? (
              <div
                className={cn(
                  "max-h-[68vh] overflow-y-auto rounded-2xl border border-border/40 bg-card/95 backdrop-blur-2xl shadow-[0_-12px_40px_-12px_hsl(var(--primary)/0.35)]",
                  "px-1 py-2",
                )}
              >
                {renderResults({ query: value, close })}
              </div>
            ) : (
              <div className="rounded-2xl border border-border/40 bg-card/90 backdrop-blur-2xl px-4 py-3 text-center text-xs text-muted-foreground/80 shadow-[0_-12px_40px_-12px_hsl(var(--primary)/0.25)]">
                {value
                  ? `Filtering by “${value}”…`
                  : "Type to filter the list below."}
              </div>
            )}

            {/* The pill — pinned at the bottom, within thumb reach */}
            <div
              className={cn(
                "flex items-center gap-2 rounded-full border border-border/60 bg-card/95 px-3 backdrop-blur-2xl",
                "shadow-[0_-8px_32px_-8px_hsl(var(--primary)/0.4)]",
                "h-14",
              )}
            >
              <Search className="h-4 w-4 shrink-0 text-primary/70" />
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label={label ?? placeholder}
                className="flex-1 min-w-0 bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground/60 placeholder:font-normal"
              />
              {value ? (
                <button
                  type="button"
                  aria-label="Clear"
                  onClick={() => onChange("")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground transition"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Close"
                  onClick={close}
                  className="rounded-full px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Done
                </button>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
