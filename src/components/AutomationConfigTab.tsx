import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Save, Zap, AlertTriangle, DollarSign, Play, TrendingUp, RefreshCw, Clock, Timer, Info, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface Props {
  userId: string;
  clientName: string;
  autoPauseBalanceUsd: number;
  overdraftLimit: number;
  systemPausedCampaigns: string[];
  guardPausedAt: string | null;
  guardResumeWindowHours: number;
  onSaved: () => void;
}

interface CampaignDetail {
  campaign_id: string;
  campaign_name: string;
  platform: string;
  ad_account_name: string;
  ad_account_id: string;
  pause_confirmed: boolean;
  pause_error: string | null;
  pause_attempt_count: number;
  pause_required: boolean;
}


export function AutomationConfigTab({
  userId,
  clientName,
  autoPauseBalanceUsd,
  overdraftLimit,
  systemPausedCampaigns,
  guardPausedAt,
  guardResumeWindowHours,
  onSaved,
}: Props) {
  const [threshold, setThreshold] = useState(String(autoPauseBalanceUsd));
  const [overdraft, setOverdraft] = useState(String(overdraftLimit));
  const [resumeWindowHours, setResumeWindowHours] = useState(String(guardResumeWindowHours));
  const [saving, setSaving] = useState(false);
  const [runningGuard, setRunningGuard] = useState(false);
  const [campaignDetails, setCampaignDetails] = useState<CampaignDetail[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const isSystemPaused = systemPausedCampaigns.length > 0;
  const effectiveThreshold = useMemo(() => (parseFloat(threshold) || 5) - (parseFloat(overdraft) || 0), [threshold, overdraft]);

  // Compute resume window status
  const windowHoursNum = parseInt(resumeWindowHours) || 24;
  const isWithinResumeWindow = useMemo(() => {
    if (!guardPausedAt || !isSystemPaused) return false;
    const pausedTime = new Date(guardPausedAt).getTime();
    const windowMs = windowHoursNum * 3600000;
    return now - pausedTime < windowMs;
  }, [guardPausedAt, isSystemPaused, windowHoursNum, now]);

  const remainingMs = useMemo(() => {
    if (!guardPausedAt || !isSystemPaused) return 0;
    const pausedTime = new Date(guardPausedAt).getTime();
    const windowMs = windowHoursNum * 3600000;
    return Math.max(0, windowMs - (now - pausedTime));
  }, [guardPausedAt, isSystemPaused, windowHoursNum, now]);

  const remainingText = useMemo(() => {
    if (remainingMs <= 0) return "";
    const hrs = Math.floor(remainingMs / 3600000);
    const mins = Math.floor((remainingMs % 3600000) / 60000);
    return hrs > 0 ? `${hrs}h ${mins}m remaining` : `${mins}m remaining`;
  }, [remainingMs]);

  // Update countdown every minute
  useEffect(() => {
    if (!isSystemPaused || !guardPausedAt) return;
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [isSystemPaused, guardPausedAt]);

  // Show paused campaigns only within resume window
  const showPausedCampaigns = isSystemPaused && isWithinResumeWindow;

  // Check if any campaign is still pending verification
  const hasPendingCampaigns = campaignDetails.some(c => !c.pause_confirmed && !c.pause_error);

  // Fetch campaign details + balance
  const fetchData = useCallback(async () => {
    // Fetch balance
    const { data: txns } = await supabase
      .from("transactions")
      .select("type, amount, status")
      .eq("client_id", userId)
      .eq("status", "completed");

    if (txns) {
      const { computeWalletBalance } = await import("@/lib/walletBalance");
      setBalance(computeWalletBalance(txns as any).total);
    }

    // Fetch campaign details if there are paused campaigns
    if (systemPausedCampaigns.length > 0) {
      setLoadingDetails(true);
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, name, platform, ad_account_id, pause_required, pause_confirmed_at, pause_error, pause_attempt_count")
        .in("id", systemPausedCampaigns);

      if (campaigns && campaigns.length > 0) {
        const accountIds = [...new Set(campaigns.map(m => m.ad_account_id).filter(Boolean))];
        const { data: accounts } = await supabase
          .from("ad_accounts")
          .select("id, account_name")
          .in("id", accountIds as string[]);

        const accountMap = new Map((accounts || []).map(a => [a.id, a.account_name]));

        setCampaignDetails(
          campaigns.map(m => ({
            campaign_id: m.id,
            campaign_name: m.name,
            platform: m.platform,
            ad_account_id: m.ad_account_id || "",
            ad_account_name: accountMap.get(m.ad_account_id || "") || "Unknown",
            pause_confirmed: !!(m as any).pause_confirmed_at,
            pause_error: (m as any).pause_error || null,
            pause_attempt_count: (m as any).pause_attempt_count || 0,
            pause_required: (m as any).pause_required ?? false,
          }))
        );
      }
      setLoadingDetails(false);
    } else {
      setCampaignDetails([]);
    }
  }, [userId, systemPausedCampaigns]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30s while campaigns are pending verification
  useEffect(() => {
    if (!hasPendingCampaigns || !isSystemPaused) return;
    const interval = setInterval(() => {
      fetchData();
    }, 30000);
    return () => clearInterval(interval);
  }, [hasPendingCampaigns, isSystemPaused, fetchData]);


  async function handleSave() {
    setSaving(true);
    const thresholdVal = parseFloat(threshold);
    if (isNaN(thresholdVal) || thresholdVal < 0) {
      toast({ title: "Invalid threshold", description: "Enter a valid dollar amount (0 or above).", variant: "destructive" });
      setSaving(false);
      return;
    }
    const windowVal = parseInt(resumeWindowHours);
    if (isNaN(windowVal) || windowVal < 1) {
      toast({ title: "Invalid window", description: "Resume window must be at least 1 hour.", variant: "destructive" });
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        auto_pause_balance_usd: thresholdVal,
        overdraft_limit_usd: overdraft ? parseFloat(overdraft) : 0,
        guard_resume_window_hours: windowVal,
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

  async function handleResumeSingle(campaignId: string) {
    setResumingId(campaignId);
    const updatedList = systemPausedCampaigns.filter(id => id !== campaignId);

    try {
      const { data: result, error } = await supabase.functions.invoke("pause-campaign", {
        body: { campaign_id: campaignId, action: "enable" },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      await supabase
        .from("profiles")
        .update({ system_paused_campaigns: updatedList })
        .eq("user_id", userId);

      toast({ title: "Campaign Resumed", description: result?.message || "Campaign has been re-activated." });
      onSaved();
    } catch (err: any) {
      toast({ title: "Resume Failed", description: err.message, variant: "destructive" });
    }
    setResumingId(null);
  }

  async function handleResumeAll() {
    setSaving(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of systemPausedCampaigns) {
      try {
        const { data: result, error } = await supabase.functions.invoke("pause-campaign", {
          body: { campaign_id: id, action: "enable" },
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
        successCount++;
      } catch {
        failCount++;
      }
    }

    await supabase.from("profiles").update({ system_paused_campaigns: [], guard_paused_at: null } as any).eq("user_id", userId);

    setSaving(false);
    if (failCount === 0) {
      toast({ title: "All Campaigns Resumed", description: `${successCount} campaigns re-activated on platform.` });
    } else {
      toast({ title: "Partial Resume", description: `${successCount} resumed, ${failCount} failed.`, variant: "destructive" });
    }
    onSaved();
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
        title: "Ad Guard Check Complete",
        description: `Jobs processed: ${result.phase1_jobs_processed}. Verified: ${result.phase1_confirmed}. Newly queued: ${result.phase2_newly_queued}.`,
      });
      fetchData();
      onSaved();
    } catch (err: any) {
      toast({ title: "Guard Error", description: err.message, variant: "destructive" });
    }
    setRunningGuard(false);
  }

  const platformIcon = (platform: string) => {
    const colors: Record<string, string> = { meta: "bg-blue-500", tiktok: "bg-pink-500", google: "bg-yellow-500" };
    return (
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white ${colors[platform] || "bg-muted"}`}>
        {platform?.[0]?.toUpperCase()}
      </span>
    );
  };

  const pauseStatusBadge = (c: CampaignDetail) => {
    if (c.pause_confirmed) {
      return (
        <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700 text-[10px]">
          <CheckCircle2 className="h-3 w-3" /> Verified ✓
        </Badge>
      );
    }
    if (c.pause_error && c.pause_attempt_count > 0) {
      return (
        <div className="space-y-0.5">
          <Badge variant="destructive" className="gap-1 text-[10px]">
            <XCircle className="h-3 w-3" /> Retrying #{c.pause_attempt_count}
          </Badge>
          <p className="text-[9px] text-destructive/70 max-w-[160px] truncate" title={c.pause_error}>
            {c.pause_error}
          </p>
        </div>
      );
    }
    if (c.pause_required) {
      return (
        <Badge variant="outline" className="gap-1 text-[10px] border-amber-500 text-amber-600">
          <Loader2 className="h-3 w-3 animate-spin" /> Pausing…
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1 text-[10px]">
        <AlertTriangle className="h-3 w-3" /> Queued
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Status + Balance Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" /> Ad Guard Configuration
          </CardTitle>
          <CardDescription>
            Automatically pause all campaigns when the client's balance drops to or below the threshold amount.
            The system pauses campaigns instantly and verifies every 2 minutes automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status + Balance Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">System Status</p>
              <div className="flex items-center gap-2">
              <Badge variant={isSystemPaused ? "destructive" : "default"} className="gap-1">
                  {isSystemPaused 
                    ? isWithinResumeWindow 
                      ? <><AlertTriangle className="h-3 w-3" /> Paused</>
                      : <><AlertTriangle className="h-3 w-3" /> Locked</>
                    : <><Zap className="h-3 w-3" /> Active</>}
                </Badge>
                {isSystemPaused && isWithinResumeWindow && <span className="text-xs text-muted-foreground">{systemPausedCampaigns.length} campaign(s)</span>}
                {isSystemPaused && !isWithinResumeWindow && <span className="text-xs text-muted-foreground">Window expired</span>}
              </div>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Current Balance</p>
              <p className={`text-lg font-semibold ${balance !== null && balance <= autoPauseBalanceUsd ? "text-destructive" : "text-foreground"}`}>
                {balance !== null ? `$${balance.toFixed(2)}` : "—"}
              </p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Effective Threshold</p>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-lg font-semibold">${effectiveThreshold.toFixed(2)}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">Pause at this balance (threshold − overdraft)</p>
            </div>
          </div>

          {/* Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" /> Pause Threshold
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input type="number" placeholder="5.00" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="pl-7" min="0" step="1" />
              </div>
              <p className="text-xs text-muted-foreground">
                Pause when balance ≤ ${effectiveThreshold.toFixed(2)} (threshold{parseFloat(overdraft) > 0 ? ` minus $${parseFloat(overdraft)} overdraft` : ""}).
              </p>
            </div>
            <div className="space-y-2">
              <Label>Overdraft Limit (USD)</Label>
              <Input type="number" placeholder="0.00" value={overdraft} onChange={(e) => setOverdraft(e.target.value)} />
              <p className="text-xs text-muted-foreground">Allow spending beyond balance up to this amount.</p>
            </div>
          </div>

          {/* Resume Window Config */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5" /> Resume Window (Hours)
              </Label>
              <Input type="number" placeholder="24" value={resumeWindowHours} onChange={(e) => setResumeWindowHours(e.target.value)} min="1" step="1" />
              <p className="text-xs text-muted-foreground">
                After this many hours, the resume option expires. Campaigns stay paused permanently unless the client deposits.
              </p>
            </div>
            {isSystemPaused && guardPausedAt && (
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Resume Window Status</p>
                {balance !== null && balance > effectiveThreshold ? (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-600">Balance recovered — status will clear on next deposit</span>
                  </div>
                ) : isWithinResumeWindow ? (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium text-amber-600">{remainingText}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Window expired — deposit funds to auto-resume</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Settings"}
            </Button>
            <Button variant="outline" onClick={handleRunGuard} disabled={runningGuard} className="gap-2" size="sm">
              <Shield className="h-4 w-4" /> {runningGuard ? "Checking…" : "Check Now"}
            </Button>
          </div>

          {hasPendingCampaigns && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Auto-verifying every 2 minutes. Status refreshes automatically.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Paused Campaigns Table */}
      {showPausedCampaigns && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <AlertTriangle className="h-4 w-4" /> Paused Campaigns ({systemPausedCampaigns.length})
                {remainingText && (
                  <Badge variant="outline" className="ml-2 text-[10px] font-normal gap-1">
                    <Clock className="h-3 w-3" /> {remainingText}
                  </Badge>
                )}
              </CardTitle>
              <Button size="sm" variant="destructive" onClick={handleResumeAll} disabled={saving} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Resume All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingDetails ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading campaign details…</p>
            ) : campaignDetails.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Ad Account</TableHead>
                      <TableHead className="w-[80px]">Platform</TableHead>
                      <TableHead className="w-[140px]">Status</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaignDetails.map((c) => (
                      <TableRow key={c.campaign_id}>
                        <TableCell className="font-medium text-sm">{c.campaign_name || c.campaign_id}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.ad_account_name}</TableCell>
                        <TableCell>{platformIcon(c.platform)}</TableCell>
                        <TableCell>{pauseStatusBadge(c)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 text-xs"
                            disabled={resumingId === c.campaign_id}
                            onClick={() => handleResumeSingle(c.campaign_id)}
                          >
                            <Play className="h-3 w-3" /> {resumingId === c.campaign_id ? "…" : "Resume"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 py-2">
                {systemPausedCampaigns.map((id) => (
                  <Badge key={id} variant="outline" className="text-xs font-mono">{id}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Window expired note */}
      {isSystemPaused && !isWithinResumeWindow && (
        <div className="flex items-start gap-2 rounded-lg border border-muted p-3">
          <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">
            The resume window has expired. Campaigns remain paused and must be reactivated manually from Campaign Mappings.
          </p>
        </div>
      )}

    </div>
  );
}
