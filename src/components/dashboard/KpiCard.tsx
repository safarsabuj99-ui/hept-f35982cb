import { useEffect, useRef, useState } from "react";
import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

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
  sparklineData?: number[];
}

function useCountUp(target: string, loading?: boolean) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    if (loading) return;
    // Extract numeric value
    const numMatch = target.match(/[\d,.]+/);
    if (!numMatch) { setDisplay(target); return; }
    const endVal = parseFloat(numMatch[0].replace(/,/g, ""));
    const prefix = target.slice(0, target.indexOf(numMatch[0]));
    const suffix = target.slice(target.indexOf(numMatch[0]) + numMatch[0].length);
    
    if (isNaN(endVal)) { setDisplay(target); return; }
    
    const startVal = 0;
    const duration = 800;
    const startTime = performance.now();
    const hasDecimals = numMatch[0].includes(".");
    
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (endVal - startVal) * eased;
      
      const formatted = hasDecimals
        ? current.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : current.toLocaleString("en-US", { maximumFractionDigits: 0 });
      
      setDisplay(`${prefix}${formatted}${suffix}`);
      if (progress < 1) requestAnimationFrame(animate);
    };
    
    requestAnimationFrame(animate);
    prevRef.current = target;
  }, [target, loading]);

  return display;
}

export function KpiCard({ title, value, subtitle, icon: Icon, loading, trend, accentColor = "hsl(var(--primary))", onClick, className, sparklineData }: KpiCardProps) {
  const animatedValue = useCountUp(value, loading);
  const chartData = sparklineData?.map((v, i) => ({ v })) ?? [];

  return (
    <Card
      className={cn(
        "glass-card glow-border group relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {/* Gradient accent bar */}
      <div
        className="absolute inset-x-0 top-0 h-1 rounded-t-lg"
        style={{
          background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)`,
        }}
      />
      {/* Subtle background glow */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.07] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.12]"
        style={{ background: accentColor }}
      />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <p className="text-2xl font-bold tracking-tight font-mono">{animatedValue}</p>
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110"
            style={{ backgroundColor: `${accentColor}15` }}
          >
            <Icon className="h-5 w-5" style={{ color: accentColor }} />
          </div>
        </div>
        {/* Sparkline */}
        {chartData.length > 1 && !loading && (
          <div className="mt-3 h-10 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={`spark-${title.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accentColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={accentColor}
                  fill={`url(#spark-${title.replace(/\s/g, "")})`}
                  strokeWidth={1.5}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
