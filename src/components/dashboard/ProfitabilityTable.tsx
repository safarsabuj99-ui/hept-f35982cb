import { useEffect, useState } from "react";
import { getPlatformRates } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { usePermissions } from "@/hooks/usePermissions";

interface PlatformDetail {
  platform: string;
  spendUsd: number;
  billingRate: number;
  gap: number;
  profitBdt: number;
  marginPct: number;
}

interface ProfitRow {
  clientName: string;
  spendUsd: number;
  revenueBdt: number;
  cogsBdt: number;
  profitBdt: number;
  marginPct: number;
  platforms: PlatformDetail[];
}

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  google: "Google",
};

const PLATFORM_COLORS: Record<string, string> = {
  meta: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  tiktok: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  google: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

interface ProfitabilityTableProps {
  dateRange?: { from: Date; to: Date } | null;
}

export function ProfitabilityTable({ dateRange }: ProfitabilityTableProps) {
  const { hasPermission } = usePermissions();
  const canViewProfit = hasPermission("can_view_profit");
  const [rows, setRows] = useState<ProfitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!canViewProfit) return;
    fetchData();
  }, [dateRange]);

  const fetchData = async () => {
    setLoading(true);

    // Step 1: Get mapped accounts WITH keywords
    const { data: mappedAssignments } = await supabase
      .from("ad_account_clients")
      .select("ad_account_id, client_id, mapping_keyword")
      .neq("mapping_keyword", "");

    const mappedAccountIds = [...new Set(mappedAssignments?.map((r: any) => r.ad_account_id) || [])];

    if (mappedAccountIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // Get campaigns from mapped accounts only
    const { data: mappedCampaigns } = await supabase
      .from("campaigns")
      .select("id, ad_account_id, platform, client_id")
      .in("ad_account_id", mappedAccountIds);

    const campaignIds = mappedCampaigns?.map((c: any) => c.id) ?? [];

    let metricsQuery = supabase.from("daily_metrics").select("campaign_id, spend");
    if (campaignIds.length > 0) {
      metricsQuery = metricsQuery.in("campaign_id", campaignIds);
    }
    if (dateRange) {
      metricsQuery = metricsQuery
        .gte("data_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("data_date", format(dateRange.to, "yyyy-MM-dd"));
    }

    const [purchasesRes, metricsRes, profilesRes, rolesRes] = await Promise.all([
      supabase.from("usd_purchases").select("bdt_amount_paid, usd_received"),
      metricsQuery,
      supabase.from("profiles").select("user_id, full_name, pricing_config"),
      supabase.from("user_roles").select("user_id").eq("role", "client"),
    ]);

    // WAC with cascading fallback
    const calcWac = (data: any[] | null) => {
      let bdt = 0, usd = 0;
      for (const p of (data ?? [])) { bdt += Number(p.bdt_amount_paid); usd += Number(p.usd_received); }
      return usd > 0 ? bdt / usd : 0;
    };

    let rangePurchases = purchasesRes.data as any[] | null;
    if (dateRange) {
      const { data: filtered } = await supabase.from("usd_purchases")
        .select("bdt_amount_paid, usd_received")
        .gte("date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("date", format(dateRange.to, "yyyy-MM-dd"));
      rangePurchases = filtered;
    }
    let wac = calcWac(rangePurchases);

    if (wac === 0) {
      const today = new Date();
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const { data: monthPurchases } = await supabase.from("usd_purchases")
        .select("bdt_amount_paid, usd_received")
        .gte("date", format(firstOfMonth, "yyyy-MM-dd"))
        .lte("date", format(today, "yyyy-MM-dd"));
      wac = calcWac(monthPurchases);
    }

    if (wac === 0) {
      wac = calcWac(purchasesRes.data);
    }

    // Mappings
    const campaignMap: Record<string, { ad_account_id: string; platform: string; client_id: string | null }> = {};
    for (const c of (mappedCampaigns ?? []) as any[]) {
      campaignMap[c.id] = { ad_account_id: c.ad_account_id, platform: c.platform, client_id: c.client_id };
    }

    const clientIds = new Set((rolesRes.data ?? []).map((r) => r.user_id));
    const profileMap: Record<string, any> = {};
    for (const p of (profilesRes.data ?? []) as any[]) {
      if (clientIds.has(p.user_id)) profileMap[p.user_id] = p;
    }

    // Aggregate spend per client per platform using campaign's client_id (not ad-account-level)
    const clientPlatformSpend: Record<string, Record<string, number>> = {};
    for (const m of (metricsRes.data ?? []) as any[]) {
      const camp = campaignMap[m.campaign_id];
      if (!camp || !camp.client_id) continue;
      if (!clientIds.has(camp.client_id)) continue;
      if (!clientPlatformSpend[camp.client_id]) clientPlatformSpend[camp.client_id] = {};
      clientPlatformSpend[camp.client_id][camp.platform] = (clientPlatformSpend[camp.client_id][camp.platform] || 0) + Number(m.spend);
    }

    // Build rows
    const result: ProfitRow[] = [];
    for (const [cid, platformSpends] of Object.entries(clientPlatformSpend)) {
      const profile = profileMap[cid];
      if (!profile) continue;
      const pricingConfig = profile.pricing_config as any;
      const rates = getPlatformRates(pricingConfig);

      let revenueBdt = 0, cogsBdt = 0, totalSpend = 0;
      const platforms: PlatformDetail[] = [];

      for (const [platform, spendUsd] of Object.entries(platformSpends)) {
        const rate = Number(rates[platform] || 120);
        const spend = spendUsd as number;
        const pRevenue = spend * rate;
        const pCogs = spend * wac;
        const pProfit = pRevenue - pCogs;
        const pMargin = pRevenue > 0 ? (pProfit / pRevenue) * 100 : 0;

        revenueBdt += pRevenue;
        cogsBdt += pCogs;
        totalSpend += spend;

        platforms.push({
          platform,
          spendUsd: Math.round(spend * 100) / 100,
          billingRate: Math.round(rate * 100) / 100,
          gap: Math.round((rate - wac) * 100) / 100,
          profitBdt: Math.round(pProfit),
          marginPct: Math.round(pMargin * 10) / 10,
        });
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
        platforms: platforms.sort((a, b) => b.profitBdt - a.profitBdt),
      });
    }

    setRows(result.sort((a, b) => b.spendUsd - a.spendUsd).slice(0, 5));
    setLoading(false);
  };

  const toggleExpand = (idx: number) => {
    setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (!canViewProfit) return null;

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
          <>
            {/* Mobile card view */}
            <div className="divide-y md:hidden">
              {rows.map((r, i) => (
                <div
                  key={`mobile-${i}`}
                  className="py-2.5 px-1 cursor-pointer"
                  onClick={() => toggleExpand(i)}
                >
                  <div className="grid grid-cols-[14px_1fr_56px_56px_52px] items-center gap-1 text-xs">
                    {expanded[i] ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="font-medium truncate">{r.clientName}</span>
                    <span className="font-mono text-muted-foreground text-right">${r.spendUsd.toLocaleString()}</span>
                    <span className="font-mono text-right">৳{r.profitBdt.toLocaleString()}</span>
                    <Badge variant={r.marginPct >= 0 ? "default" : "destructive"} className="text-[10px] px-1.5 py-0 justify-center">
                      {r.marginPct >= 0 ? "+" : ""}{r.marginPct}%
                    </Badge>
                  </div>
                  {expanded[i] && (
                    <div className="mt-1.5 pb-1 space-y-1">
                      {r.platforms.map((p) => (
                        <div key={p.platform} className="grid grid-cols-[14px_1fr_56px_56px_52px] items-center gap-1 text-[11px]">
                          <span />
                          <Badge variant="outline" className={`text-[10px] w-fit ${PLATFORM_COLORS[p.platform] || ""}`}>
                            {PLATFORM_LABELS[p.platform] || p.platform}
                          </Badge>
                          <span className="text-muted-foreground font-mono text-right">${p.spendUsd.toLocaleString()}</span>
                          <span className="font-mono text-right">৳{p.profitBdt.toLocaleString()}</span>
                          <Badge variant={p.marginPct >= 0 ? "default" : "destructive"} className="text-[10px] px-1 py-0 justify-center">
                            {p.marginPct >= 0 ? "+" : ""}{p.marginPct}%
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto -mx-4 px-4">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="whitespace-nowrap">Client</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Spend (USD)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Revenue (BDT)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Cost (BDT)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Profit (BDT)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <>
                      <TableRow
                        key={`client-${i}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleExpand(i)}
                      >
                        <TableCell className="w-8 px-2">
                          {expanded[i] ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
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
                      {expanded[i] && r.platforms.map((p) => (
                        <TableRow key={`${i}-${p.platform}`} className="bg-muted/30">
                          <TableCell></TableCell>
                          <TableCell className="pl-6">
                            <Badge variant="outline" className={`text-[10px] ${PLATFORM_COLORS[p.platform] || ""}`}>
                              {PLATFORM_LABELS[p.platform] || p.platform}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">${p.spendUsd.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">৳{Math.round(p.spendUsd * p.billingRate).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            <span className="text-[10px]">Rate: ৳{p.billingRate} | Gap: ৳{p.gap}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">৳{p.profitBdt.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={p.marginPct >= 0 ? "default" : "destructive"} className="text-[10px]">
                              {p.marginPct >= 0 ? "+" : ""}{p.marginPct}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
