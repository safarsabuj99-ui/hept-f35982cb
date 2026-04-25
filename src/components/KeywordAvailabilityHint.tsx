import { CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";
import type { KeywordAvailability } from "@/hooks/useKeywordAvailability";

interface Props {
  availability: KeywordAvailability;
}

/**
 * Tiny inline status indicator shown directly under a mapping-keyword input.
 * Designed to be unobtrusive but informative.
 */
export function KeywordAvailabilityHint({ availability }: Props) {
  if (availability.state === "idle") return null;

  if (availability.state === "checking") {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking availability…
      </p>
    );
  }

  if (availability.state === "available") {
    return (
      <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mt-1">
        <CheckCircle2 className="h-3 w-3" />
        Available
      </p>
    );
  }

  if (availability.state === "self") {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
        <Info className="h-3 w-3" />
        Already linked to this client (allowed)
      </p>
    );
  }

  return (
    <p className="text-xs text-destructive flex items-center gap-1.5 mt-1">
      <AlertCircle className="h-3 w-3" />
      Already used by <span className="font-medium">{availability.ownerName}</span>
    </p>
  );
}
