import { CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts";
import { DailyPoint } from "@/lib/finance/aggregate";

interface Props {
  takeHome: number;
  takeHomePrev: number | null;
  series: DailyPoint[];
  loading: boolean;
  periodLabel: string;
}

export function PnlHero({ takeHome, takeHomePrev, series, loading, periodLabel }: Props) {
  const delta = takeHomePrev !== null ? takeHome - takeHomePrev : null;
  const deltaPct = takeHomePrev && takeHomePrev !== 0
    ? Math.round(((takeHome - takeHomePrev) / Math.abs(takeHomePrev)) * 1000) / 10
    : null;

  const positive = takeHome >= 0;
  const deltaPositive = (delta ?? 0) >= 0;

  return (
    <div className={`glass-card glow-border ${positive ? "border-success/30" : "border-destructive/30"}`}>
      <CardContent className="pt-6">
        <div className="flex flex-col lg:flex-row gap-6 lg:items-center">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Wallet className="h-3.5 w-3.5" />
              <span>Take-Home Profit · {periodLabel}</span>
            </div>
            {loading ? (
              <Skeleton className="h-12 w-48" />
            ) : (
              <p className={`text-4xl font-bold font-mono ${positive ? "text-success" : "text-destructive"}`}>
                ৳{takeHome.toLocaleString()}
              </p>
            )}
            {!loading && delta !== null && (
              <div className={`mt-2 inline-flex items-center gap-1 text-sm font-medium ${deltaPositive ? "text-success" : "text-destructive"}`}>
                {deltaPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                <span className="font-mono">{deltaPositive ? "+" : ""}৳{delta.toLocaleString()}</span>
                {deltaPct !== null && Number.isFinite(deltaPct) && (
                  <span className="text-muted-foreground">({deltaPositive ? "+" : ""}{deltaPct}% vs previous)</span>
                )}
              </div>
            )}
          </div>
          <div className="w-full lg:w-72 h-20">
            {loading || series.length === 0 ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                    formatter={(v: any) => [`৳${Number(v).toLocaleString()}`, "Net"]}
                    labelFormatter={(l) => l}
                  />
                  <Area type="monotone" dataKey="net" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#netGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
            <p className="text-[10px] text-muted-foreground mt-1 text-center">Last 30 days · Net Profit</p>
          </div>
        </div>
      </CardContent>
    </div>
  );
}
