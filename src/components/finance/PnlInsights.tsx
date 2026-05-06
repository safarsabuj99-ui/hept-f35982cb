import { Insight } from "@/lib/finance/insights";
import { CardContent } from "@/components/ui/card";
import { TrendingUp, AlertTriangle, AlertCircle, Sparkles, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  positive: TrendingUp,
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info,
} as const;

const STYLES = {
  positive: "border-success/30 bg-success/5",
  warning: "border-warning/30 bg-warning/5",
  danger: "border-destructive/30 bg-destructive/5",
  info: "border-primary/30 bg-primary/5",
} as const;

const ICON_COLOR = {
  positive: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-primary",
} as const;

export function PnlInsights({ insights }: { insights: Insight[] }) {
  return (
    <div className="glass-card glow-border">
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Smart Insights</h3>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {insights.map((ins, i) => {
            const Icon = ICONS[ins.tone];
            return (
              <div key={i} className={cn("rounded-lg border p-3 flex gap-3", STYLES[ins.tone])}>
                <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", ICON_COLOR[ins.tone])} />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{ins.title}</p>
                  {ins.detail && <p className="text-xs text-muted-foreground mt-1">{ins.detail}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </div>
  );
}
