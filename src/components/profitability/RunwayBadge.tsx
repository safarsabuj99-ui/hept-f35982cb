import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  days: number | null;
  className?: string;
}

export function RunwayBadge({ days, className }: Props) {
  if (days === null || days === undefined || !isFinite(days)) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const tone =
    days < 3
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : days < 7
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-mono", tone, className)}
      title="Wallet USD ÷ average daily spend (last 7 days)"
    >
      {days < 0.1 ? "<0.1" : days.toFixed(1)}d
    </Badge>
  );
}
