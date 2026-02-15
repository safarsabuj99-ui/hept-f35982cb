import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp } from "lucide-react";

interface ProfitRow {
  clientName: string;
  rawSpendBdt: number;
  billedUsd: number;
  rateUsed: number;
  margin: number;
}

export function ProfitabilityTable() {
  const [rows, setRows] = useState<ProfitRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [spendRes, accRes, profilesRes, rolesRes] = await Promise.all([
      supabase.from("daily_ad_spend").select("ad_account_id, raw_spend_amount, raw_currency, exchange_rate_used, final_billable_usd"),
      supabase.from("ad_accounts").select("id, client_id"),
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("user_roles").select("user_id").eq("role", "client"),
    ]);

    const accToClient: Record<string, string> = {};
    for (const a of (accRes.data ?? []) as any[]) accToClient[a.id] = a.client_id;

    const clientNames: Record<string, string> = {};
    for (const p of (profilesRes.data ?? []) as any[]) clientNames[p.user_id] = p.full_name;

    const clientIds = new Set((rolesRes.data ?? []).map((r) => r.user_id));

    // Aggregate per client
    const agg: Record<string, { rawBdt: number; billedUsd: number; rateSum: number; count: number }> = {};
    for (const s of (spendRes.data ?? []) as any[]) {
      const clientId = accToClient[s.ad_account_id];
      if (!clientId || !clientIds.has(clientId)) continue;
      if (!agg[clientId]) agg[clientId] = { rawBdt: 0, billedUsd: 0, rateSum: 0, count: 0 };
      if (s.raw_currency === "BDT") {
        agg[clientId].rawBdt += Number(s.raw_spend_amount);
      } else {
        agg[clientId].rawBdt += Number(s.raw_spend_amount) * Number(s.exchange_rate_used);
      }
      agg[clientId].billedUsd += Number(s.final_billable_usd);
      agg[clientId].rateSum += Number(s.exchange_rate_used);
      agg[clientId].count++;
    }

    const result: ProfitRow[] = Object.entries(agg).map(([cid, data]) => ({
      clientName: clientNames[cid] || "Unknown",
      rawSpendBdt: Math.round(data.rawBdt * 100) / 100,
      billedUsd: Math.round(data.billedUsd * 100) / 100,
      rateUsed: data.count > 0 ? Math.round((data.rateSum / data.count) * 100) / 100 : 0,
      margin: data.rawBdt > 0 ? Math.round(((data.billedUsd * (data.rateSum / data.count) - data.rawBdt) / data.rawBdt) * 10000) / 100 : 0,
    }));

    setRows(result.sort((a, b) => b.billedUsd - a.billedUsd));
    setLoading(false);
  };

  return (
    <Card className="dark:bg-card/80 dark:backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <TrendingUp className="h-4 w-4" /> Profitability View
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No spend data available</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Raw Spend (BDT)</TableHead>
                <TableHead className="text-right">Billed (USD)</TableHead>
                <TableHead className="text-right">Avg Rate</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.clientName}</TableCell>
                  <TableCell className="text-right font-mono text-xs">৳{r.rawSpendBdt.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs">${r.billedUsd.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.rateUsed}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={r.margin >= 0 ? "default" : "destructive"} className="text-xs">
                      {r.margin >= 0 ? "+" : ""}{r.margin}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
