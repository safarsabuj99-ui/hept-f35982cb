import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp } from "lucide-react";

interface ProfitRow {
  clientName: string;
  spendUsd: number;
  revenueBdt: number;
  cogsBdt: number;
  profitBdt: number;
  marginPct: number;
}

export function ProfitabilityTable() {
  const [rows, setRows] = useState<ProfitRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [purchasesRes, campaignsRes, metricsRes, accClientsRes, profilesRes, rolesRes] = await Promise.all([
      supabase.from("usd_purchases").select("bdt_amount_paid, usd_received"),
      supabase.from("campaigns").select("id, ad_account_id, platform"),
      supabase.from("daily_metrics").select("campaign_id, spend"),
      supabase.from("ad_account_clients").select("ad_account_id, client_id"),
      supabase.from("profiles").select("user_id, full_name, pricing_config"),
      supabase.from("user_roles").select("user_id").eq("role", "client"),
    ]);

    // WAC
    let totalBdt = 0, totalUsd = 0;
    for (const p of (purchasesRes.data ?? []) as any[]) {
      totalBdt += Number(p.bdt_amount_paid);
      totalUsd += Number(p.usd_received);
    }
    const wac = totalUsd > 0 ? totalBdt / totalUsd : 128;

    // Mappings
    const campaignMap: Record<string, { ad_account_id: string; platform: string }> = {};
    for (const c of (campaignsRes.data ?? []) as any[]) {
      campaignMap[c.id] = { ad_account_id: c.ad_account_id, platform: c.platform };
    }

    const accToClients: Record<string, string[]> = {};
    for (const ac of (accClientsRes.data ?? []) as any[]) {
      if (!accToClients[ac.ad_account_id]) accToClients[ac.ad_account_id] = [];
      accToClients[ac.ad_account_id].push(ac.client_id);
    }

    const clientIds = new Set((rolesRes.data ?? []).map((r) => r.user_id));
    const profileMap: Record<string, any> = {};
    for (const p of (profilesRes.data ?? []) as any[]) {
      if (clientIds.has(p.user_id)) profileMap[p.user_id] = p;
    }

    // Aggregate spend per client per platform
    const clientPlatformSpend: Record<string, Record<string, number>> = {};
    for (const m of (metricsRes.data ?? []) as any[]) {
      const camp = campaignMap[m.campaign_id];
      if (!camp) continue;
      const clients = accToClients[camp.ad_account_id] || [];
      for (const cid of clients) {
        if (!clientIds.has(cid)) continue;
        if (!clientPlatformSpend[cid]) clientPlatformSpend[cid] = {};
        clientPlatformSpend[cid][camp.platform] = (clientPlatformSpend[cid][camp.platform] || 0) + Number(m.spend);
      }
    }

    // Build rows
    const result: ProfitRow[] = [];
    for (const [cid, platformSpends] of Object.entries(clientPlatformSpend)) {
      const profile = profileMap[cid];
      if (!profile) continue;
      const pricingConfig = profile.pricing_config as any;
      const rates = pricingConfig?.flat_rates || pricingConfig?.platform_rates || { meta: 120, tiktok: 120, google: 120 };

      let revenueBdt = 0, cogsBdt = 0, totalSpend = 0;
      for (const [platform, spendUsd] of Object.entries(platformSpends)) {
        const rate = Number(rates[platform] || 120);
        revenueBdt += (spendUsd as number) * rate;
        cogsBdt += (spendUsd as number) * wac;
        totalSpend += spendUsd as number;
      }

      const profitBdt = revenueBdt - cogsBdt;
      const marginPct = revenueBdt > 0 ? (profitBdt / revenueBdt) * 100 : 0;

      result.push({
        clientName: profile.full_name || "Unknown",
        spendUsd: Math.round(totalSpend * 100) / 100,
        revenueBdt: Math.round(revenueBdt),
        cogsBdt: Math.round(cogsBdt),
        profitBdt: Math.round(profitBdt),
        marginPct: Math.round(marginPct * 10) / 10,
      });
    }

    setRows(result.sort((a, b) => b.profitBdt - a.profitBdt));
    setLoading(false);
  };

  return (
    <Card className="dark:bg-card/80 dark:backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <TrendingUp className="h-4 w-4" /> Profitability View (BDT)
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
                <TableHead className="text-right">Spend (USD)</TableHead>
                <TableHead className="text-right">Revenue (BDT)</TableHead>
                <TableHead className="text-right">Cost (BDT)</TableHead>
                <TableHead className="text-right">Profit (BDT)</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.clientName}</TableCell>
                  <TableCell className="text-right font-mono text-xs">${r.spendUsd.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs">৳{r.revenueBdt.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs">৳{r.cogsBdt.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs">৳{r.profitBdt.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={r.marginPct >= 0 ? "default" : "destructive"} className="text-xs">
                      {r.marginPct >= 0 ? "+" : ""}{r.marginPct}%
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
