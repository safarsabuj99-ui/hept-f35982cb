import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, ComposedChart, Area, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { DailyPoint } from "@/lib/finance/aggregate";

export function PnlTrendChart({ data }: { data: DailyPoint[] }) {
  const fmtDate = (s: string) => {
    const d = new Date(s);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  return (
    <div className="glass-card glow-border">
      <CardHeader><CardTitle className="text-base">30-Day Trend</CardTitle></CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <ComposedChart data={data}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `৳${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                formatter={(v: any, n: any) => [`৳${Number(v).toLocaleString()}`, n]}
                labelFormatter={fmtDate}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" opacity={0.5} />
              <Bar dataKey="cogs" name="COGS" fill="hsl(var(--destructive))" opacity={0.5} />
              <Bar dataKey="opex" name="OpEx" fill="hsl(var(--warning))" opacity={0.5} />
              <Line dataKey="net" name="Net Profit" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </div>
  );
}
