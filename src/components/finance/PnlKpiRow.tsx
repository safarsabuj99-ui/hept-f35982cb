import { CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight, DollarSign, TrendingUp, Banknote, Percent } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiProps {
  label: string;
  value: number;
  prev: number | null;
  loading: boolean;
  format?: "bdt" | "pct";
  Icon: typeof DollarSign;
  accent?: "primary" | "success" | "destructive" | "warning";
}

function Kpi({ label, value, prev, loading, format = "bdt", Icon, accent = "primary" }: KpiProps) {
  const delta = prev !== null ? value - prev : null;
  const deltaPct = prev && prev !== 0 ? Math.round(((value - prev) / Math.abs(prev)) * 1000) / 10 : null;
  const deltaPositive = (delta ?? 0) >= 0;
  const accentBg = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-warning/10 text-warning",
  }[accent];

  const fmt = (n: number) => format === "pct" ? `${n}%` : `৳${n.toLocaleString()}`;

  return (
    <div className="glass-card glow-border">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start gap-3">
          <div className={cn("rounded-lg p-2 hidden sm:block", accentBg)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
              <p className="text-xl font-bold font-mono mt-0.5">{fmt(value)}</p>
            )}
            {!loading && delta !== null && (
              <div className={cn("mt-1 inline-flex items-center gap-1 text-[11px] font-medium",
                deltaPositive ? "text-success" : "text-destructive")}>
                {deltaPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                <span className="font-mono">
                  {format === "pct"
                    ? `${deltaPositive ? "+" : ""}${(Math.round((delta) * 10) / 10)}pp`
                    : `${deltaPositive ? "+" : ""}৳${delta.toLocaleString()}`}
                </span>
                {deltaPct !== null && Number.isFinite(deltaPct) && format !== "pct" && (
                  <span className="text-muted-foreground">({deltaPositive ? "+" : ""}{deltaPct}%)</span>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </div>
  );
}

interface Props {
  current: { revenue: number; grossProfit: number; netProfit: number; margin: number };
  previous: { revenue: number; grossProfit: number; netProfit: number; margin: number } | null;
  loading: boolean;
}

export function PnlKpiRow({ current, previous, loading }: Props) {
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <Kpi label="Revenue" value={current.revenue} prev={previous?.revenue ?? null} loading={loading} Icon={DollarSign} accent="primary" />
      <Kpi label="Gross Profit" value={current.grossProfit} prev={previous?.grossProfit ?? null} loading={loading} Icon={TrendingUp} accent="success" />
      <Kpi label="Net Profit" value={current.netProfit} prev={previous?.netProfit ?? null} loading={loading} Icon={Banknote} accent={current.netProfit >= 0 ? "success" : "destructive"} />
      <Kpi label="Net Margin" value={current.margin} prev={previous?.margin ?? null} loading={loading} format="pct" Icon={Percent} accent="primary" />
    </div>
  );
}
