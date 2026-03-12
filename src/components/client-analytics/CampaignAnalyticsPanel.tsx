import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DeepDiveTable, CampaignRow, PresetType } from "@/components/client-analytics/DeepDiveTable";
import { SalesFunnel } from "@/components/client-analytics/SalesFunnel";
import { PlatformComparison } from "@/components/client-analytics/PlatformComparison";
import { usePresetPreferences } from "@/hooks/usePresetPreferences";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { DollarSign, ShoppingCart, TrendingUp, Target, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const safeDivide = (a: number, b: number) => (b > 0 ? a / b : 0);

interface CampaignAnalyticsPanelProps {
  campaignRows: CampaignRow[];
  onRefresh: () => void;
}

type PlatformTab = "all" | "meta" | "tiktok" | "google";

export function CampaignAnalyticsPanel({ campaignRows, onRefresh }: CampaignAnalyticsPanelProps) {
  const { getDefaultPreset, setDefaultPreset, getColumnOrder, setColumnOrder } = usePresetPreferences();

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

  const renderDeepDiveTable = (data: CampaignRow[], platform: PlatformTab) => (
    <DeepDiveTable
      data={data}
      onCampaignPaused={onRefresh}
      defaultPreset={getDefaultPreset(platform)}
      onSetDefaultPreset={(preset) => setDefaultPreset(platform, preset)}
      savedColumnOrder={getColumnOrder(platform)}
      onColumnOrderChange={(order) => setColumnOrder(platform, order)}
    />
  );

  return (
    <div className="space-y-5">
      {/* KPI Summary Cards — Premium KpiCard */}
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Spend"
          value={fmt(totals.spend)}
          icon={DollarSign}
          accentColor="hsl(var(--primary))"
          staggerIndex={0}
        />
        <KpiCard
          title="Total Results"
          value={totals.results.toLocaleString()}
          icon={ShoppingCart}
          accentColor="hsl(142 71% 45%)"
          staggerIndex={1}
        />
        <KpiCard
          title="Avg ROAS"
          value={`${avgRoas.toFixed(2)}x`}
          icon={TrendingUp}
          accentColor="hsl(214 80% 52%)"
          staggerIndex={2}
        />
        <KpiCard
          title="Avg CPO"
          value={fmt(avgCpo)}
          icon={Target}
          accentColor="hsl(38 92% 50%)"
          staggerIndex={3}
        />
      </div>

      {/* Tabbed Content — Glassmorphic Tabs */}
      <Tabs defaultValue="live" className="space-y-4">
        <div className="inline-flex rounded-full p-1 border border-border/50" style={{ background: 'hsl(var(--muted) / 0.5)', backdropFilter: 'blur(8px)' }}>
          <TabsTrigger
            value="live"
            className="gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground transition-all duration-200"
          >
            <Radio className="h-3.5 w-3.5" /> Live Campaigns
            {activeCampaigns > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{activeCampaigns}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="overview"
            className="rounded-full px-4 py-1.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground transition-all duration-200"
          >
            Overview
          </TabsTrigger>
        </div>

        <TabsContent value="live">
          <Tabs defaultValue="all" className="space-y-4">
            <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
              <div className="inline-flex rounded-full p-1 border border-border/50" style={{ background: 'hsl(var(--muted) / 0.4)', backdropFilter: 'blur(8px)' }}>
                <TabsTrigger value="all" className="rounded-full px-3.5 py-1.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-200">
                  All
                  <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{campaignRows.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="meta" className="rounded-full px-3.5 py-1.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-200 data-[state=active]:text-[hsl(214,80%,52%)]">
                  Meta
                  {metaRows.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{metaRows.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="tiktok" className="rounded-full px-3.5 py-1.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-200">
                  TikTok
                  {tiktokRows.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{tiktokRows.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="google" className="rounded-full px-3.5 py-1.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-200 data-[state=active]:text-[hsl(38,92%,50%)]">
                  Google
                  {googleRows.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{googleRows.length}</Badge>}
                </TabsTrigger>
              </div>
            </div>
            <TabsContent value="all">
              {renderDeepDiveTable(campaignRows, "all")}
            </TabsContent>
            <TabsContent value="meta">
              {renderDeepDiveTable(metaRows, "meta")}
            </TabsContent>
            <TabsContent value="tiktok">
              {renderDeepDiveTable(tiktokRows, "tiktok")}
            </TabsContent>
            <TabsContent value="google">
              {renderDeepDiveTable(googleRows, "google")}
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
