import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Search, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

interface UnmappedCampaign {
  campaign_name: string;
  total_spend: number;
  last_active: string;
  ad_account_name: string;
  platform: string;
  ad_account_id: string;
}

export default function UnassignedSpendRisks() {
  const [campaigns, setCampaigns] = useState<UnmappedCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    const [{ data: spendData }, { data: mappings }, { data: adAccounts }] = await Promise.all([
      supabase.from("daily_ad_spend" as any).select("campaign_name, final_billable_usd, date, ad_account_id") as any,
      supabase.from("campaign_mappings" as any).select("campaign_name, client_id") as any,
      supabase.from("ad_accounts").select("id, account_name, platform_name"),
    ]);

    const mappedCampaigns = new Set(
      (mappings ?? []).filter((m: any) => m.client_id).map((m: any) => m.campaign_name)
    );

    const accountMap = new Map(
      (adAccounts ?? []).map((a: any) => [a.id, { name: a.account_name, platform: a.platform_name }])
    );

    const agg: Record<string, { total: number; lastDate: string; adAccountId: string }> = {};
    for (const row of spendData ?? []) {
      if (!mappedCampaigns.has(row.campaign_name)) {
        if (!agg[row.campaign_name]) {
          agg[row.campaign_name] = { total: 0, lastDate: row.date, adAccountId: row.ad_account_id };
        }
        agg[row.campaign_name].total += Number(row.final_billable_usd);
        if (row.date > agg[row.campaign_name].lastDate) {
          agg[row.campaign_name].lastDate = row.date;
        }
      }
    }

    const items: UnmappedCampaign[] = Object.entries(agg)
      .map(([name, { total, lastDate, adAccountId }]) => {
        const acc = accountMap.get(adAccountId);
        return {
          campaign_name: name,
          total_spend: total,
          last_active: lastDate,
          ad_account_id: adAccountId,
          ad_account_name: acc?.name ?? "Unknown",
          platform: acc?.platform ?? "—",
        };
      })
      .sort((a, b) => b.total_spend - a.total_spend);

    setCampaigns(items);
    setLoading(false);
  };

  const filtered = useMemo(
    () => campaigns.filter((c) => c.campaign_name.toLowerCase().includes(search.toLowerCase())),
    [campaigns, search]
  );

  const totalRisk = filtered.reduce((s, c) => s + c.total_spend, 0);

  const fmt = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/attention")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Unassigned Spend Risks</h1>
          <p className="text-muted-foreground text-sm mt-1">Campaigns spending without a client mapping — revenue at risk.</p>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid gap-4 grid-cols-2">
        <Card className="glass-card">
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Unassigned Spend</p>
            <p className="text-2xl font-bold text-destructive mt-1 font-mono">{fmt(totalRisk)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Unassigned Campaigns</p>
            <p className="text-2xl font-bold mt-1">{filtered.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search + Action */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => navigate("/admin/campaigns")} className="shrink-0">
          Map Campaigns
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center text-muted-foreground">
            {search ? "No campaigns match your search." : "🎉 All campaigns are assigned!"}
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card key={c.campaign_name} className="glass-card">
              <CardContent className="p-4 space-y-2">
                <p className="font-medium truncate">{c.campaign_name}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{c.ad_account_name}</span>
                  <Badge variant="outline" className="capitalize">{c.platform}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last active: {c.last_active}</span>
                  <span className="font-mono text-destructive font-semibold">{fmt(c.total_spend)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign Name</TableHead>
                <TableHead>Ad Account</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead className="text-right">Total Spend</TableHead>
                <TableHead className="text-right">Last Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.campaign_name}>
                  <TableCell className="font-medium max-w-[250px] truncate">{c.campaign_name}</TableCell>
                  <TableCell>{c.ad_account_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{c.platform}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-destructive">{fmt(c.total_spend)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{c.last_active}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
