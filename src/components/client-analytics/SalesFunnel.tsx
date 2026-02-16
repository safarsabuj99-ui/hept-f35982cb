import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SalesFunnelProps {
  impressions: number;
  clicks: number;
  results: number;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--primary) / 0.7)",
  "hsl(var(--primary) / 0.45)",
];

const fmtNum = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
};

const safePct = (part: number, whole: number) =>
  whole > 0 ? ((part / whole) * 100).toFixed(2) : "0.00";

export function SalesFunnel({ impressions, clicks, results }: SalesFunnelProps) {
  const data = useMemo(
    () => [
      { name: "Impressions", value: impressions, rate: "100%" },
      {
        name: "Clicks",
        value: clicks,
        rate: `${safePct(clicks, impressions)}% CTR`,
      },
      {
        name: "Results",
        value: results,
        rate: `${safePct(results, clicks)}% Conv.`,
      },
    ],
    [impressions, clicks, results]
  );

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md text-sm">
        <p className="font-semibold">{d.name}</p>
        <p className="font-mono">{fmtNum(d.value)}</p>
        <p className="text-xs text-muted-foreground">{d.rate}</p>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sales Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        {impressions === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">No funnel data available</p>
        ) : (
          <div className="space-y-3">
            {data.map((step, i) => {
              const widthPct = impressions > 0 ? Math.max((step.value / impressions) * 100, 4) : 0;
              return (
                <div key={step.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{step.name}</span>
                    <span className="text-muted-foreground text-xs">{step.rate}</span>
                  </div>
                  <div className="relative h-10 w-full rounded-lg bg-muted/30 overflow-hidden">
                    <div
                      className="h-full rounded-lg transition-all duration-700 ease-out flex items-center justify-center"
                      style={{
                        width: `${widthPct}%`,
                        background: `linear-gradient(90deg, ${COLORS[i]}, ${COLORS[i]}dd)`,
                      }}
                    >
                      <span className="text-xs font-mono font-bold text-primary-foreground drop-shadow">
                        {fmtNum(step.value)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
              <span>Overall Conversion: {safePct(results, impressions)}%</span>
              <span>{fmtNum(results)} orders from {fmtNum(impressions)} impressions</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
