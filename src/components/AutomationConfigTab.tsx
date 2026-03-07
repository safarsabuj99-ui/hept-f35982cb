import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Shield, Save, Zap, AlertTriangle, DollarSign } from "lucide-react";

interface Props {
  userId: string;
  autoPauseBalanceUsd: number;
  overdraftLimit: number;
  systemPausedCampaigns: string[];
  onSaved: () => void;
}

export function AutomationConfigTab({
  userId,
  autoPauseBalanceUsd,
  overdraftLimit,
  systemPausedCampaigns,
  onSaved,
}: Props) {
  const [threshold, setThreshold] = useState(String(autoPauseBalanceUsd));
  const [overdraft, setOverdraft] = useState(String(overdraftLimit));
  const [saving, setSaving] = useState(false);
  const [runningGuard, setRunningGuard] = useState(false);

  const isSystemPaused = systemPausedCampaigns.length > 0;

  async function handleSave() {
    setSaving(true);
    const thresholdVal = parseFloat(threshold);
    if (isNaN(thresholdVal) || thresholdVal < 0) {
      toast({ title: "Invalid threshold", description: "Enter a valid dollar amount (0 or above).", variant: "destructive" });
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        auto_pause_balance_usd: thresholdVal,
        overdraft_limit_usd: overdraft ? parseFloat(overdraft) : 0,
      } as any)
      .eq("user_id", userId);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Automation settings updated." });
      onSaved();
    }
  }

  async function handleManualResume() {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ system_paused_campaigns: [] })
      .eq("user_id", userId);

    // Re-activate campaigns
    for (const campaignId of systemPausedCampaigns) {
      await supabase
        .from("campaign_mappings")
        .update({ is_active: true })
        .eq("campaign_id", campaignId);
    }

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Campaigns Resumed", description: "All system-paused campaigns have been re-activated." });
      onSaved();
    }
  }

  async function handleRunGuard() {
    setRunningGuard(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("ad-guard-check", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw res.error;
      const result = res.data;
      toast({
        title: "Ad Guard Scan Complete",
        description: `Checked ${result.checked} clients. ${result.total_campaigns_paused} campaigns paused.`,
      });
      onSaved();
    } catch (err: any) {
      toast({ title: "Guard Error", description: err.message, variant: "destructive" });
    }
    setRunningGuard(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" /> Ad Guard Configuration
        </CardTitle>
        <CardDescription>
          Automatically pause all campaigns when the client's balance drops to or below the threshold amount.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Indicator */}
        <div className="flex items-center gap-3 rounded-lg border p-4">
          <div className="flex-1">
            <p className="text-sm font-medium">System Status</p>
            <p className="text-xs text-muted-foreground">
              {isSystemPaused
                ? `${systemPausedCampaigns.length} campaign(s) auto-paused by Ad Guard`
                : "All campaigns running normally"}
            </p>
          </div>
          <Badge
            variant={isSystemPaused ? "destructive" : "default"}
            className="gap-1"
          >
            {isSystemPaused ? (
              <>
                <AlertTriangle className="h-3 w-3" /> System Paused
              </>
            ) : (
              <>
                <Zap className="h-3 w-3" /> Active
              </>
            )}
          </Badge>
        </div>

        {isSystemPaused && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 space-y-3">
            <p className="text-sm font-medium text-destructive">Paused Campaigns</p>
            <div className="flex flex-wrap gap-1.5">
              {systemPausedCampaigns.map((id) => (
                <Badge key={id} variant="outline" className="text-xs font-mono">
                  {id}
                </Badge>
              ))}
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleManualResume}
              disabled={saving}
            >
              Manual Override: Resume All
            </Button>
          </div>
        )}

        {/* Dollar Threshold Input */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5" /> Pause When Balance Drops To
          </Label>
          <div className="relative max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input
              type="number"
              placeholder="5.00"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="pl-7 max-w-xs"
              min="0"
              step="1"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            All campaigns will auto-pause when remaining balance ≤ this amount. Set $0 to only pause at zero/negative balance.
          </p>
        </div>

        {/* Overdraft Limit */}
        <div className="space-y-2">
          <Label>Overdraft Limit (USD)</Label>
          <Input
            type="number"
            placeholder="0.00"
            value={overdraft}
            onChange={(e) => setOverdraft(e.target.value)}
            className="max-w-xs"
          />
          <p className="text-xs text-muted-foreground">
            Allow spending beyond balance up to this amount (VIP clients). Set 0 to disable.
          </p>
        </div>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Settings"}
          </Button>
          <Button
            variant="outline"
            onClick={handleRunGuard}
            disabled={runningGuard}
            className="gap-2"
          >
            <Shield className="h-4 w-4" /> {runningGuard ? "Scanning…" : "Run Ad Guard Now"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
