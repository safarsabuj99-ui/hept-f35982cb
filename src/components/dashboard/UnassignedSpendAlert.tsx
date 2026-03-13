import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface UnmappedCampaign {
  campaign_name: string;
  total_spend: number;
  date: string;
}

export function UnassignedSpendAlert() {
  const [unmapped, setUnmapped] = useState<UnmappedCampaign[]>([]);
  const [totalRisk, setTotalRisk] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUnmapped();
  }, []);

  const fetchUnmapped = async () => {
    // Get all daily_ad_spend records
    const { data: spendData } = await (supabase
      .from("daily_ad_spend" as any)
      .select("campaign_name, final_billable_usd, date, ad_account_id") as any);

    // Get campaign_mappings to find which campaigns have a client
    const { data: mappings } = await (supabase
      .from("campaign_mappings" as any)
      .select("campaign_name, client_id") as any);

    const mappedCampaigns = new Set(
      (mappings ?? []).filter((m: any) => m.client_id).map((m: any) => m.campaign_name)
    );

    // Find spend on unmapped campaigns
    const unmappedSpend: Record<string, { total: number; date: string }> = {};
    for (const row of spendData ?? []) {
      if (!mappedCampaigns.has(row.campaign_name)) {
        if (!unmappedSpend[row.campaign_name]) {
          unmappedSpend[row.campaign_name] = { total: 0, date: row.date };
        }
        unmappedSpend[row.campaign_name].total += Number(row.final_billable_usd);
        if (row.date > unmappedSpend[row.campaign_name].date) {
          unmappedSpend[row.campaign_name].date = row.date;
        }
      }
    }

    const items = Object.entries(unmappedSpend)
      .map(([name, { total, date }]) => ({ campaign_name: name, total_spend: total, date }))
      .sort((a, b) => b.total_spend - a.total_spend);

    setUnmapped(items);
    setTotalRisk(items.reduce((s, i) => s + i.total_spend, 0));
  };

  if (unmapped.length === 0) return null;

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-base">⚠️ Unassigned Spend Risk</CardTitle>
          </div>
          <Badge variant="destructive" className="font-mono">
            ${totalRisk.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="max-h-32 overflow-y-auto space-y-1">
          {unmapped.slice(0, 5).map((c) => (
            <div key={c.campaign_name} className="flex items-center justify-between text-sm">
              <span className="truncate max-w-[200px]">{c.campaign_name}</span>
              <span className="font-mono text-destructive">
                ${c.total_spend.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
          {unmapped.length > 5 && (
            <p className="text-xs text-muted-foreground">+{unmapped.length - 5} more campaigns</p>
          )}
        </div>
        <div className="flex gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={() => navigate("/admin/unassigned-spend")}
          >
            View All
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => navigate("/admin/campaigns")}
          >
            Map Campaigns
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
