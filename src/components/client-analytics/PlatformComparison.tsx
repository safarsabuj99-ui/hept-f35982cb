import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";

interface PlatformStats {
  platform: string;
  totalSpend: number;
  totalResults: number;
  totalConversionValue: number;
}

interface PlatformComparisonProps {
  data: PlatformStats[];
}

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  google: "Google",
};

const PLATFORM_COLORS: Record<string, string> = {
  meta: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  tiktok: "bg-neutral-900/10 text-neutral-700 dark:text-neutral-300 border-neutral-500/30",
  google: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
};

const safeDivide = (a: number, b: number) => (b > 0 ? a / b : 0);
const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface MetricRow {
  label: string;
  values: { platform: string; value: number; formatted: string }[];
  lowerIsBetter?: boolean;
}

export function PlatformComparison({ data }: PlatformComparisonProps) {
  const metrics: MetricRow[] = useMemo(() => {
    const platforms = data.filter((d) => d.totalSpend > 0);
    if (platforms.length === 0) return [];

    return [
      {
        label: "Avg. Cost Per Result",
        lowerIsBetter: true,
        values: platforms.map((p) => ({
          platform: p.platform,
          value: safeDivide(p.totalSpend, p.totalResults),
          formatted: fmt(safeDivide(p.totalSpend, p.totalResults)),
        })),
      },
      {
        label: "Total Spend",
        lowerIsBetter: true,
        values: platforms.map((p) => ({
          platform: p.platform,
          value: p.totalSpend,
          formatted: fmt(p.totalSpend),
        })),
      },
      {
        label: "ROAS",
        lowerIsBetter: false,
        values: platforms.map((p) => ({
          platform: p.platform,
          value: safeDivide(p.totalConversionValue, p.totalSpend),
          formatted: `${safeDivide(p.totalConversionValue, p.totalSpend).toFixed(2)}x`,
        })),
      },
    ];
  }, [data]);

  const getWinner = (metric: MetricRow) => {
    if (metric.values.length === 0) return null;
    const sorted = [...metric.values].sort((a, b) =>
      metric.lowerIsBetter ? a.value - b.value : b.value - a.value
    );
    // Only show winner if value > 0
    return sorted[0].value > 0 ? sorted[0].platform : null;
  };

  const getInsight = () => {
    if (data.filter((d) => d.totalSpend > 0).length < 2) return null;
    const cpoMetric = metrics.find((m) => m.label === "Avg. Cost Per Result");
    if (!cpoMetric || cpoMetric.values.length < 2) return null;
    const sorted = [...cpoMetric.values].sort((a, b) => a.value - b.value);
    if (sorted[0].value === 0 || sorted[1].value === 0) return null;
    const savings = ((1 - sorted[0].value / sorted[1].value) * 100).toFixed(0);
    return `${PLATFORM_LABELS[sorted[0].platform] || sorted[0].platform} is giving you ${savings}% cheaper results`;
  };

  if (metrics.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Platform Comparison</CardTitle></CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground text-sm py-8">Need data from multiple platforms to compare</p>
        </CardContent>
      </Card>
    );
  }

  const insight = getInsight();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Platform Comparison</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {metrics.map((metric) => {
          const winner = getWinner(metric);
          return (
            <div key={metric.label} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {metric.label}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {metric.values.map((v) => {
                  const isWinner = winner === v.platform;
                  return (
                    <div
                      key={v.platform}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition-all ${
                        isWinner ? "ring-2 ring-primary/30 bg-primary/5" : "bg-muted/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={PLATFORM_COLORS[v.platform] || ""}>
                          {PLATFORM_LABELS[v.platform] || v.platform}
                        </Badge>
                        {isWinner && <Trophy className="h-3.5 w-3.5 text-yellow-500" />}
                      </div>
                      <span className="font-mono text-sm font-semibold">{v.formatted}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {insight && (
          <div className="mt-3 rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
            <p className="text-sm font-medium text-primary flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              {insight}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
