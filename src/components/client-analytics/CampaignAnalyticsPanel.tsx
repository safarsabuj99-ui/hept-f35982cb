import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DeepDiveTable, CampaignRow, PresetType } from "@/components/client-analytics/DeepDiveTable";
import { SalesFunnel } from "@/components/client-analytics/SalesFunnel";
import { PlatformComparison } from "@/components/client-analytics/PlatformComparison";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { usePresetPreferences } from "@/hooks/usePresetPreferences";
import { DollarSign, ShoppingCart, TrendingUp, Target, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const safeDivide = (a: number, b: number) => (b > 0 ? a / b : 0);

interface CampaignAnalyticsPanelProps {
  campaignRows: CampaignRow[];
  onRefresh: () => void;
}

type PlatformTab = "all" | "meta" | "tiktok" | "google";

const PLATFORM_ACCENT: Record<PlatformTab, string> = {
  all: "hsl(var(--primary))",
  meta: "#3b82f6",
  tiktok: "#e4405f",
  google: "#f59e0b",
};

export function CampaignAnalyticsPanel({ campaignRows, onRefresh }: CampaignAnalyticsPanelProps) {
  const { getDefaultPreset, setDefaultPreset, getColumnOrder, setColumnOrder } = usePresetPreferences();
  const [overviewOpen, setOverviewOpen] = useState(true);

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
    <div className="space-y-6">
      {/* Premium KPI Cards */}
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
          accentColor="#22c55e"
          staggerIndex={1}
        />
        <KpiCard
          title="Avg ROAS"
          value={`${avgRoas.toFixed(2)}x`}
          icon={TrendingUp}
          accentColor="#3b82f6"
          staggerIndex={2}
        />
        <KpiCard
          title="Avg CPO"
          value={fmt(avgCpo)}
          icon={Target}
          accentColor="#f97316"
          staggerIndex={3}
        />
      </div>

      {/* Inline Overview — Collapsible */}
      <Collapsible open={overviewOpen} onOpenChange={setOverviewOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors group w-full">
          <span className="uppercase tracking-wider text-[11px]">Overview</span>
          <div className="flex-1 h-px bg-border" />
          {overviewOpen ? (
            <ChevronUp className="h-4 w-4 transition-transform" />
          ) : (
            <ChevronDown className="h-4 w-4 transition-transform" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SalesFunnel impressions={totals.impressions} clicks={totals.clicks} results={totals.results} />
            <PlatformComparison data={platformStats} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Platform Tabs — Flat, Premium Styling */}
      <Tabs defaultValue="all" className="space-y-4">
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <TabsList className="inline-flex w-auto gap-1 bg-muted/40 backdrop-blur-sm border border-border/50 p-1 rounded-xl">
            <TabsTrigger
              value="all"
              className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all duration-200"
            >
              <span className="flex items-center gap-1.5">
                All
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] data-[state=active]:bg-primary-foreground/20 data-[state=active]:text-primary-foreground">{campaignRows.length}</Badge>
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="meta"
              className="rounded-lg data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200"
            >
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#3b82f6] shrink-0" />
                Meta
                {metaRows.length > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{metaRows.length}</Badge>}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="tiktok"
              className="rounded-lg data-[state=active]:bg-[#e4405f] data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200"
            >
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#e4405f] shrink-0" />
                TikTok
                {tiktokRows.length > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{tiktokRows.length}</Badge>}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="google"
              className="rounded-lg data-[state=active]:bg-[#f59e0b] data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200"
            >
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#f59e0b] shrink-0" />
                Google
                {googleRows.length > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{googleRows.length}</Badge>}
              </span>
            </TabsTrigger>
          </TabsList>
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
    </div>
  );
}
