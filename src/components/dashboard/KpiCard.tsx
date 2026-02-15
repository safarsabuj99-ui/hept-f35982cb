import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  loading?: boolean;
  trend?: { value: string; positive: boolean } | null;
  accentColor?: string;
  onClick?: () => void;
  className?: string;
}

export function KpiCard({ title, value, subtitle, icon: Icon, loading, trend, accentColor = "hsl(var(--primary))", onClick, className }: KpiCardProps) {
  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 dark:bg-card/80 dark:backdrop-blur-sm",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      <div className="absolute inset-x-0 top-0 h-1 rounded-t-lg" style={{ background: accentColor }} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2 min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <p className="text-2xl font-bold tracking-tight font-mono">{value}</p>
            )}
            {subtitle && !loading && (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            )}
            {trend && !loading && (
              <p className={cn("text-xs font-medium", trend.positive ? "text-success" : "text-destructive")}>
                {trend.positive ? "↑" : "↓"} {trend.value}
              </p>
            )}
          </div>
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors"
            style={{ backgroundColor: `${accentColor}15` }}
          >
            <Icon className="h-5 w-5" style={{ color: accentColor }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
