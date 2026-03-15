import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Save, Zap, AlertTriangle, DollarSign, Play, History, TrendingUp, RefreshCw } from "lucide-react";

interface Props {
  userId: string;
  clientName: string;
  autoPauseBalanceUsd: number;
  overdraftLimit: number;
  systemPausedCampaigns: string[];
  onSaved: () => void;
}

interface CampaignDetail {
  campaign_id: string;
  campaign_name: string;
  platform: string;
  ad_account_name: string;
  ad_account_id: string;
}

interface GuardEvent {
  id: string;
  action_type: string;
  description: string;
  created_at: string;
}

export function AutomationConfigTab({
  userId,
  clientName,
  autoPauseBalanceUsd,
  overdraftLimit,
  systemPausedCampaigns,
  onSaved,
}: Props) {
  const [threshold, setThreshold] = useState(String(autoPauseBalanceUsd));
  const [overdraft, setOverdraft] = useState(String(overdraftLimit));
  const [saving, setSaving] = useState(false);
  const [runningGuard, setRunningGuard] = useState(false);
  const [campaignDetails, setCampaignDetails] = useState<CampaignDetail[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [guardHistory, setGuardHistory] = useState<GuardEvent[]>([]);
  const [resumingId, setResumingId] = useState<string | null>(null);

  const isSystemPaused = systemPausedCampaigns.length > 0;
  const autoResumeThreshold = useMemo(() => (parseFloat(threshold) || 5) * 2, [threshold]);

  // Fetch campaign details, balance, and guard history
  useEffect(() => {
    async function fetchData() {
      // Fetch balance
      const { data: txns } = await supabase
        .from("transactions")
        .select("type, amount, status")
        .eq("client_id", userId)
        .eq("status", "completed");

      if (txns) {
        const credits = txns.filter(t => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
        const debits = txns.filter(t => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);
        setBalance(credits - debits);
      }

      // Fetch guard history — search by client user_id OR description containing client name
      const { data: logs } = await supabase
        .from("audit_logs")
        .select("id, action_type, description, created_at")
        .in("action_type", ["ad_guard_pause", "ad_guard_resume"])
        .or(`user_id.eq.${userId},description.ilike.%${clientName}%`)
        .order("created_at", { ascending: false })
        .limit(20);

      if (logs) setGuardHistory(logs);

      // Fetch campaign details if there are paused campaigns
      if (systemPausedCampaigns.length > 0) {
        setLoadingDetails(true);
        const { data: mappings } = await supabase
          .from("campaign_mappings")
          .select("campaign_id, campaign_name, platform, ad_account_id")
          .in("campaign_id", systemPausedCampaigns);

        if (mappings && mappings.length > 0) {
          const accountIds = [...new Set(mappings.map(m => m.ad_account_id).filter(Boolean))];
          const { data: accounts } = await supabase
            .from("ad_accounts")
            .select("id, account_name")
            .in("id", accountIds as string[]);

          const accountMap = new Map((accounts || []).map(a => [a.id, a.account_name]));

          setCampaignDetails(
            mappings.map(m => ({
              campaign_id: m.campaign_id,
              campaign_name: m.campaign_name,
              platform: m.platform,
              ad_account_id: m.ad_account_id || "",
              ad_account_name: accountMap.get(m.ad_account_id || "") || "Unknown",
            }))
          );
        }
        setLoadingDetails(false);
      } else {
        setCampaignDetails([]);
      }
    }
    fetchData();
  }, [userId, clientName, systemPausedCampaigns]);

  // Computed history stats
  const pauseCount = guardHistory.filter(e => e.action_type === "ad_guard_pause").length;
  const resumeCount = guardHistory.filter(e => e.action_type === "ad_guard_resume").length;
  const lastEvent = guardHistory.length > 0 ? guardHistory[0] : null;

  function relativeTime(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  function parseDescription(desc: string) {
    const campaignMatch = desc.match(/(\d+)\s*campaign/i);
    const balanceMatch = desc.match(/Balance:\s*\$([0-9.,]+)/i);
    const thresholdMatch = desc.match(/threshold:\s*\$([0-9.,]+)/i);
    // Extract campaign names from "[Name1, Name2]" pattern
    const namesMatch = desc.match(/:\s*\[([^\]]+)\]\./);
    const campaignNames = namesMatch ? namesMatch[1].split(",").map(n => n.trim()) : [];
    return {
      campaigns: campaignMatch ? campaignMatch[1] : null,
      balance: balanceMatch ? balanceMatch[1] : null,
      threshold: thresholdMatch ? thresholdMatch[1] : null,
      campaignNames,
    };
  }

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

  async function handleResumeSingle(campaignId: string) {
    setResumingId(campaignId);
    const updatedList = systemPausedCampaigns.filter(id => id !== campaignId);

    const [profileRes, campaignRes] = await Promise.all([
      supabase
        .from("profiles")
        .update({ system_paused_campaigns: updatedList })
        .eq("user_id", userId),
      supabase
        .from("campaign_mappings")
        .update({ is_active: true })
        .eq("campaign_id", campaignId),
    ]);

    setResumingId(null);
    if (profileRes.error || campaignRes.error) {
      toast({ title: "Error", description: (profileRes.error || campaignRes.error)?.message, variant: "destructive" });
    } else {
      toast({ title: "Campaign Resumed", description: `Campaign has been re-activated.` });
      onSaved();
    }
  }

  async function handleResumeAll() {
    setSaving(true);
    const [profileRes] = await Promise.all([
      supabase.from("profiles").update({ system_paused_campaigns: [] }).eq("user_id", userId),
      ...systemPausedCampaigns.map(id =>
        supabase.from("campaign_mappings").update({ is_active: true }).eq("campaign_id", id)
      ),
    ]);
    setSaving(false);
    if (profileRes.error) {
      toast({ title: "Error", description: profileRes.error.message, variant: "destructive" });
    } else {
      toast({ title: "All Campaigns Resumed", description: "All system-paused campaigns have been re-activated." });
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

  const platformIcon = (platform: string) => {
    const colors: Record<string, string> = { meta: "bg-blue-500", tiktok: "bg-pink-500", google: "bg-yellow-500" };
    return (
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white ${colors[platform] || "bg-muted"}`}>
        {platform?.[0]?.toUpperCase()}
      </span>
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
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status + Balance Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">System Status</p>
              <div className="flex items-center gap-2">
                <Badge variant={isSystemPaused ? "destructive" : "default"} className="gap-1">
                  {isSystemPaused ? <><AlertTriangle className="h-3 w-3" /> Paused</> : <><Zap className="h-3 w-3" /> Active</>}
                </Badge>
                {isSystemPaused && <span className="text-xs text-muted-foreground">{systemPausedCampaigns.length} campaign(s)</span>}
              </div>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Current Balance</p>
              <p className={`text-lg font-semibold ${balance !== null && balance <= autoPauseBalanceUsd ? "text-destructive" : "text-foreground"}`}>
                {balance !== null ? `$${balance.toFixed(2)}` : "—"}
              </p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Auto-Resume At</p>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-lg font-semibold">${autoResumeThreshold.toFixed(2)}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">2× pause threshold</p>
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
                {parseFloat(overdraft) > 0 
                  ? "Pause when balance ≤ this amount." 
                  : "No overdraft — guard activates only when balance reaches $0."}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Overdraft Limit (USD)</Label>
              <Input type="number" placeholder="0.00" value={overdraft} onChange={(e) => setOverdraft(e.target.value)} />
              <p className="text-xs text-muted-foreground">Allow spending beyond balance up to this amount.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Settings"}
            </Button>
            <Button variant="outline" onClick={handleRunGuard} disabled={runningGuard} className="gap-2" size="sm">
              <Shield className="h-4 w-4" /> {runningGuard ? "Scanning…" : "Run Ad Guard Now"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Paused Campaigns Table */}
      {isSystemPaused && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <AlertTriangle className="h-4 w-4" /> Paused Campaigns ({systemPausedCampaigns.length})
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
                      <TableHead className="w-[90px] text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaignDetails.map((c) => (
                      <TableRow key={c.campaign_id}>
                        <TableCell className="font-medium text-sm">{c.campaign_name || c.campaign_id}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.ad_account_name}</TableCell>
                        <TableCell>{platformIcon(c.platform)}</TableCell>
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

      {/* Guard History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> Guard History
          </CardTitle>
          <CardDescription>Pause & resume events for this client</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 space-y-0.5">
              <p className="text-xs text-muted-foreground">Times Paused</p>
              <p className="text-2xl font-bold text-destructive">{pauseCount}</p>
            </div>
            <div className="rounded-lg border p-3 space-y-0.5">
              <p className="text-xs text-muted-foreground">Times Resumed</p>
              <p className="text-2xl font-bold text-green-600">{resumeCount}</p>
            </div>
            <div className="rounded-lg border p-3 space-y-0.5">
              <p className="text-xs text-muted-foreground">Last Event</p>
              {lastEvent ? (
                <>
                  <Badge variant={lastEvent.action_type === "ad_guard_pause" ? "destructive" : "default"} className="text-[10px]">
                    {lastEvent.action_type === "ad_guard_pause" ? "PAUSED" : "RESUMED"}
                  </Badge>
                  <p className="text-xs text-muted-foreground">{relativeTime(lastEvent.created_at)}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No events</p>
              )}
            </div>
          </div>

          {/* History Table */}
          {guardHistory.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">Event</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="w-[140px] text-right">Date & Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guardHistory.map((event) => {
                    const parsed = parseDescription(event.description);
                    const isPause = event.action_type === "ad_guard_pause";
                    return (
                      <TableRow key={event.id} className={isPause ? "bg-destructive/5" : "bg-green-500/5"}>
                        <TableCell>
                          <Badge variant={isPause ? "destructive" : "default"} className="text-[10px]">
                            {isPause ? "PAUSED" : "RESUMED"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {parsed.campaigns && (
                                <span className="font-medium">{parsed.campaigns} campaign(s)</span>
                              )}
                              {parsed.balance && (
                                <span className="text-muted-foreground">Balance: ${parsed.balance}</span>
                              )}
                            </div>
                            {parsed.campaignNames.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {parsed.campaignNames.map((name, i) => (
                                  <Badge key={i} variant="outline" className="text-[10px] font-normal">{name}</Badge>
                                ))}
                              </div>
                            )}
                            {!parsed.campaigns && !parsed.balance && (
                              <span className="text-muted-foreground truncate block max-w-[300px]">{event.description}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          <div>{new Date(event.created_at).toLocaleDateString()}</div>
                          <div>{relativeTime(event.created_at)}</div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No guard events recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
