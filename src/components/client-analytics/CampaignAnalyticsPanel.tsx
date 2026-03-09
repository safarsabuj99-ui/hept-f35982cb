import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DeepDiveTable, CampaignRow } from "@/components/client-analytics/DeepDiveTable";
import { SalesFunnel } from "@/components/client-analytics/SalesFunnel";
import { PlatformComparison } from "@/components/client-analytics/PlatformComparison";
import { DollarSign, ShoppingCart, TrendingUp, Target, Radio } from "lucide-react";

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const safeDivide = (a: number, b: number) => (b > 0 ? a / b : 0);

interface CampaignAnalyticsPanelProps {
  campaignRows: CampaignRow[];
  onRefresh: () => void;
}

export function CampaignAnalyticsPanel({ campaignRows, onRefresh }: CampaignAnalyticsPanelProps) {
  const totals = useMemo(() => {
    const t = { spend: 0, impressions: 0, clicks: 0, results: 0, convValue: 0 };
    for (const r of campaignRows) {
      t.spend += r.spend;
      t.impressions += r.impressions;
      t.clicks += r.clicks;
      t.results += r.results;
      t.convValue += r.conversion_value;
    }
    return t;
  }, [campaignRows]);

  const avgRoas = safeDivide(totals.convValue, totals.spend);
  const avgCpo = safeDivide(totals.spend, totals.results);

  const platformStats = useMemo(() => {
    const map: Record<string, { platform: string; totalSpend: number; totalResults: number; totalConversionValue: number }> = {};
    for (const r of campaignRows) {
      if (!map[r.platform]) {
        map[r.platform] = { platform: r.platform, totalSpend: 0, totalResults: 0, totalConversionValue: 0 };
      }
      map[r.platform].totalSpend += r.spend;
      map[r.platform].totalResults += r.results;
      map[r.platform].totalConversionValue += r.conversion_value;
    }
    return Object.values(map);
  }, [campaignRows]);

  const activeCampaigns = campaignRows.filter(r => r.status === "active").length;

  const metaRows = useMemo(() => campaignRows.filter(r => r.platform === "meta"), [campaignRows]);
  const tiktokRows = useMemo(() => campaignRows.filter(r => r.platform === "tiktok"), [campaignRows]);
  const googleRows = useMemo(() => campaignRows.filter(r => r.platform === "google"), [campaignRows]);

  return (
    <div className="space-y-4">
      {/* KPI Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{fmt(totals.spend)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
              <ShoppingCart className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Results</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{totals.results.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
              <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg ROAS</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{avgRoas.toFixed(2)}x</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
              <Target className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg CPO</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{fmt(avgCpo)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="live" className="space-y-4">
        <TabsList>
          <TabsTrigger value="live" className="gap-1.5">
            <Radio className="h-4 w-4" /> Live Campaigns
            {activeCampaigns > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{activeCampaigns}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">
                All
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{campaignRows.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="meta">
                Meta
                {metaRows.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{metaRows.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="tiktok">
                TikTok
                {tiktokRows.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{tiktokRows.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="google">
                Google
                {googleRows.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{googleRows.length}</Badge>}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <DeepDiveTable data={campaignRows} onCampaignPaused={onRefresh} />
            </TabsContent>
            <TabsContent value="meta">
              <DeepDiveTable data={metaRows} onCampaignPaused={onRefresh} />
            </TabsContent>
            <TabsContent value="tiktok">
              <DeepDiveTable data={tiktokRows} onCampaignPaused={onRefresh} />
            </TabsContent>
            <TabsContent value="google">
              <DeepDiveTable data={googleRows} onCampaignPaused={onRefresh} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="overview">
          <div className="space-y-6">
            <SalesFunnel impressions={totals.impressions} clicks={totals.clicks} results={totals.results} />
            <PlatformComparison data={platformStats} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
