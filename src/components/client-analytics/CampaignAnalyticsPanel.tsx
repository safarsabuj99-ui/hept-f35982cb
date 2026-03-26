import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DeepDiveTable, CampaignRow, PresetType } from "@/components/client-analytics/DeepDiveTable";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { usePresetPreferences } from "@/hooks/usePresetPreferences";
import { DollarSign, ShoppingCart, Package, Users, MessageCircle } from "lucide-react";

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const safeDivide = (a: number, b: number) => (b > 0 ? a / b : 0);

interface CampaignAnalyticsPanelProps {
  campaignRows: CampaignRow[];
  onRefresh: () => void;
  canToggleCampaigns?: boolean;
}

type PlatformTab = "all" | "meta" | "tiktok" | "google";

export function CampaignAnalyticsPanel({ campaignRows, onRefresh, canToggleCampaigns = true }: CampaignAnalyticsPanelProps) {
  const { getDefaultPreset, setDefaultPreset, getColumnOrder, setColumnOrder } = usePresetPreferences();

  const totals = useMemo(() => {
    const t = { spend: 0, results: 0, createOrder: 0, leads: 0, messages: 0 };
    for (const r of campaignRows) {
      t.spend += r.spend;
      t.results += r.results;
      t.createOrder += r.create_order ?? 0;
      t.leads += r.leads_tiktok_dm ?? 0;
      t.messages += (r.messaging_conversations ?? 0) + (r.conversations_tiktok_dm ?? 0) + (r.conversations_instant_msg ?? 0);
    }
    return t;
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
      canToggleCampaigns={canToggleCampaigns}
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

      {/* Platform Tabs — Premium Styling */}
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
