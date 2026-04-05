import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, Zap, RefreshCw, BarChart3, Bell, Target, Activity, CheckCircle2, XCircle, Clock, Info, Save } from "lucide-react";

type SyncFunction = "sync-fast-lane" | "sync-deep-dive" | "billing-radar";

const SYNC_FUNCTIONS: { key: SyncFunction; label: string; icon: React.ReactNode; description: string }[] = [
  { key: "sync-fast-lane", label: "Fast Lane", icon: <Zap className="h-4 w-4" />, description: "Spend + billing cycle sync" },
  { key: "sync-deep-dive", label: "Deep Dive", icon: <BarChart3 className="h-4 w-4" />, description: "Detailed performance data" },
  { key: "billing-radar", label: "Billing", icon: <Bell className="h-4 w-4" />, description: "Threshold alerts" },
];

const INTERVAL_OPTIONS = [
  { value: "15", label: "15 min" }, { value: "30", label: "30 min" },
  { value: "60", label: "1 hour" }, { value: "120", label: "2 hours" }, { value: "240", label: "4 hours" },
];

interface ScheduleRow { key: string; label: string; platform: string; recommended: string; recommendedLabel: string; reason: string; }

const SCHEDULE_ROWS: ScheduleRow[] = [
  { key: "sync_interval_meta_fastlane", label: "Meta", platform: "meta", recommended: "30", recommendedLabel: "30 min", reason: "Real-time reporting API with generous rate limits" },
  { key: "sync_interval_tiktok_fastlane", label: "TikTok", platform: "tiktok", recommended: "60", recommendedLabel: "1 hour", reason: "15-30 min data lag, strict 10 req/sec limit" },
  { key: "sync_interval_google_fastlane", label: "Google", platform: "google", recommended: "30", recommendedLabel: "30 min", reason: "Near real-time data, high API quotas" },
  { key: "sync_interval_deepdive", label: "Deep Dive", platform: "all", recommended: "60", recommendedLabel: "1-2 hours", reason: "Heavy payload (25+ fields), TikTok bottleneck" },
];

export function SyncTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<Record<string, string>>({});
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [adAccounts, setAdAccounts] = useState<{ id: string; account_name: string; ad_account_id: string; platform_name: string }[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [syncingAccount, setSyncingAccount] = useState(false);
  const [syncHealth, setSyncHealth] = useState<any[]>([]);
  const [loadingSyncHealth, setLoadingSyncHealth] = useState(true);
  const [retryingAccount, setRetryingAccount] = useState<string | null>(null);

  const fetchLastSynced = async () => {
    const { data } = await supabase.from("api_integrations").select("last_synced_at").order("last_synced_at", { ascending: false }).limit(1).single();
    if (data?.last_synced_at) setLastSyncedAt(data.last_synced_at);
  };

  const fetchSyncHealth = async () => {
    setLoadingSyncHealth(true);
    try {
      const { data: accounts } = await supabase.from("ad_accounts").select("id, account_name, ad_account_id, platform_name").eq("is_active", true).order("account_name");
      if (!accounts?.length) { setSyncHealth([]); setLoadingSyncHealth(false); return; }
      const { data: logs } = await supabase.from("sync_logs" as any).select("*").order("created_at", { ascending: false }).limit(500);
      const healthData = accounts.map((acc: any) => {
        const accountLogs = (logs ?? []).filter((l: any) => l.ad_account_id === acc.id);
        const functions = ["sync-fast-lane", "sync-deep-dive"];
        const functionStatus: Record<string, any> = {};
        for (const fn of functions) {
          const fnLogs = accountLogs.filter((l: any) => l.function_name === fn);
          const latest = fnLogs[0];
          const lastSuccess = fnLogs.find((l: any) => l.status === "success");
          const recentFailures = fnLogs.filter((l: any) => l.status === "failed").length;
          functionStatus[fn] = { latest, lastSuccess, recentFailures };
        }
        return { ...acc, functionStatus, totalLogs: accountLogs.length };
      });
      setSyncHealth(healthData);
    } catch (err) { console.error("Failed to load sync health:", err); }
    setLoadingSyncHealth(false);
  };

  useEffect(() => {
    supabase.from("settings" as any).select("key, value").in("key", SCHEDULE_ROWS.map(r => r.key)).then(({ data }: any) => {
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[row.key] = row.value;
      for (const r of SCHEDULE_ROWS) { if (!map[r.key]) map[r.key] = r.recommended; }
      setSchedules(map); setLoadingSchedule(false);
    });
    fetchLastSynced(); fetchSyncHealth();
    supabase.from("ad_accounts").select("id, account_name, ad_account_id, platform_name").eq("is_active", true).order("account_name").then(({ data }) => setAdAccounts(data ?? []));
  }, []);

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    let hasError = false;
    for (const row of SCHEDULE_ROWS) {
      const { error } = await (supabase.from("settings" as any) as any).update({ value: schedules[row.key] || row.recommended, updated_by: user?.id }).eq("key", row.key);
      if (error) hasError = true;
    }
    setSavingSchedule(false);
    toast(hasError ? { title: "Error", description: "Some settings could not be saved.", variant: "destructive" } : { title: "Saved", description: "Sync schedules updated." });
  };

  const handleManualSync = async (fn: SyncFunction, platform?: string) => {
    const syncKey = platform ? `${fn}:${platform}` : fn;
    setSyncing(prev => ({ ...prev, [syncKey]: true }));
    const body = platform ? { platform } : undefined;
    const { data, error } = await supabase.functions.invoke(fn, { body });
    setSyncing(prev => ({ ...prev, [syncKey]: false }));
    if (error) toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Sync Complete", description: data?.message || `${fn} finished.` });
      if (data?.errors?.length) data.errors.forEach((err: any) => toast({ title: "Warning", description: typeof err === "string" ? err : JSON.stringify(err), variant: "destructive" }));
      fetchLastSynced(); fetchSyncHealth();
    }
  };

  const handleSyncAll = async () => {
    setSyncing(prev => ({ ...prev, all: true }));
    for (const fn of SYNC_FUNCTIONS) {
      setSyncing(prev => ({ ...prev, [fn.key]: true }));
      const { error } = await supabase.functions.invoke(fn.key);
      setSyncing(prev => ({ ...prev, [fn.key]: false }));
      if (error) toast({ title: `${fn.label} Failed`, description: error.message, variant: "destructive" });
    }
    setSyncing(prev => ({ ...prev, all: false }));
    toast({ title: "All Syncs Complete" }); fetchLastSynced(); fetchSyncHealth();
  };

  const handleForceRetry = async (accountId: string, accountName: string) => {
    setRetryingAccount(accountId);
    try {
      const { error } = await supabase.functions.invoke("sync-deep-dive", { body: { ad_account_ids: [accountId] } });
      if (error) toast({ title: "Retry Failed", description: error.message, variant: "destructive" });
      else { toast({ title: "Retry Complete", description: `Sync retried for ${accountName}` }); fetchSyncHealth(); }
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setRetryingAccount(null);
  };

  return (
    <div className="space-y-6">
      {/* Schedule Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Clock className="h-5 w-5 text-primary" /></div>
            <div><CardTitle>Sync Schedule</CardTitle><CardDescription>Set how often each platform syncs data</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingSchedule ? <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
            <>
              <div className="space-y-3">
                {SCHEDULE_ROWS.map(row => {
                  const current = schedules[row.key] || row.recommended;
                  const isRecommended = current === row.recommended;
                  return (
                    <div key={row.key} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{row.label}</span>
                          {row.platform !== "all" && <Badge variant="outline" className="text-[10px] capitalize">{row.platform}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{row.reason}</p>
                      </div>
                      <Select value={current} onValueChange={(val) => setSchedules(prev => ({ ...prev, [row.key]: val }))}>
                        <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{INTERVAL_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <div className="w-[90px] text-right">
                        {isRecommended ? <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Optimal</Badge>
                          : <Badge variant="outline" className="text-[10px] text-muted-foreground">Rec: {row.recommendedLabel}</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">Recommendations are based on each platform's API rate limits and data reporting lag.</p>
              </div>
              <Button onClick={handleSaveSchedule} className="w-full" disabled={savingSchedule}>
                {savingSchedule ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Schedule
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Manual Sync */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><RefreshCw className="h-5 w-5 text-primary" /></div>
            <div><CardTitle>Manual Sync</CardTitle><CardDescription>Trigger data collection instantly</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {SYNC_FUNCTIONS.map(fn => (
              <Button key={fn.key} variant="outline" className="justify-start gap-2" disabled={syncing[fn.key] || syncing.all} onClick={() => handleManualSync(fn.key)}>
                {syncing[fn.key] ? <Loader2 className="h-4 w-4 animate-spin" /> : fn.icon} {fn.label}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Deep Dive by Platform</p>
            <div className="grid grid-cols-3 gap-2">
              {(["meta", "google", "tiktok"] as const).map(platform => {
                const syncKey = `sync-deep-dive:${platform}`;
                const anySyncing = Object.values(syncing).some(Boolean);
                return (
                  <Button key={platform} variant="outline" size="sm" className="gap-1.5 capitalize" disabled={syncing[syncKey] || anySyncing} onClick={() => handleManualSync("sync-deep-dive", platform)}>
                    {syncing[syncKey] ? <Loader2 className="h-3 w-3 animate-spin" /> : <BarChart3 className="h-3 w-3" />}
                    {platform === "meta" ? "Meta" : platform === "google" ? "Google" : "TikTok"}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Deep Dive by Account</p>
            <div className="flex gap-2">
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select ad account..." /></SelectTrigger>
                <SelectContent>{adAccounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.account_name || acc.ad_account_id} ({acc.platform_name})</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={!selectedAccountId || syncingAccount || Object.values(syncing).some(Boolean)}
                onClick={async () => {
                  setSyncingAccount(true);
                  const { data, error } = await supabase.functions.invoke("sync-deep-dive", { body: { ad_account_ids: [selectedAccountId] } });
                  setSyncingAccount(false);
                  if (error) toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
                  else { toast({ title: "Sync Complete", description: `Deep Dive synced for ${adAccounts.find(a => a.id === selectedAccountId)?.account_name || "account"}.` }); fetchLastSynced(); fetchSyncHealth(); }
                }}>
                {syncingAccount ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <Button className="w-full" disabled={syncing.all || Object.values(syncing).some(Boolean)} onClick={handleSyncAll}>
            {syncing.all ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Sync All
          </Button>
          {lastSyncedAt && <p className="text-xs text-muted-foreground text-center">Last synced: {formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}</p>}
        </CardContent>
      </Card>

      {/* Account Health */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Activity className="h-5 w-5 text-primary" /></div>
              <div><CardTitle>Account Health</CardTitle><CardDescription>Per-account sync status and error tracking</CardDescription></div>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchSyncHealth} disabled={loadingSyncHealth}><RefreshCw className={cn("h-4 w-4", loadingSyncHealth && "animate-spin")} /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSyncHealth ? <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
            : syncHealth.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No sync data yet.</p>
            : (
              <div className="space-y-3">
                {syncHealth.map((acc: any) => {
                  const functions = ["sync-fast-lane", "sync-deep-dive"];
                  const hasAnyFailure = functions.some(fn => acc.functionStatus[fn]?.latest?.status === "failed");
                  const allSuccess = functions.every(fn => { const s = acc.functionStatus[fn]; return !s?.latest || s.latest.status === "success"; });
                  return (
                    <div key={acc.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {allSuccess ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : hasAnyFailure ? <XCircle className="h-4 w-4 text-destructive" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
                          <span className="font-medium text-sm">{acc.account_name || acc.ad_account_id}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">{acc.platform_name}</Badge>
                        </div>
                        {hasAnyFailure && (
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={retryingAccount === acc.id} onClick={() => handleForceRetry(acc.id, acc.account_name)}>
                            {retryingAccount === acc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Retry
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {functions.map(fn => {
                          const s = acc.functionStatus[fn];
                          const latest = s?.latest;
                          const lastSuccess = s?.lastSuccess;
                          const label = fn.replace("sync-", "").replace("-", " ");
                          if (!latest) return <div key={fn} className="rounded bg-muted/50 px-2 py-1.5"><p className="text-[10px] font-medium text-muted-foreground capitalize">{label}</p><p className="text-[10px] text-muted-foreground">No data</p></div>;
                          const isSuccess = latest.status === "success";
                          const isFailed = latest.status === "failed";
                          return (
                            <div key={fn} className={cn("rounded px-2 py-1.5", isSuccess && "bg-green-500/10", isFailed && "bg-destructive/10", !isSuccess && !isFailed && "bg-muted/50")}>
                              <p className="text-[10px] font-medium capitalize">{label}</p>
                              <div className="flex items-center gap-1">
                                {isSuccess ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : isFailed ? <XCircle className="h-3 w-3 text-destructive" /> : <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                                <span className="text-[10px] text-muted-foreground">{latest.completed_at ? formatDistanceToNow(new Date(latest.completed_at), { addSuffix: true }) : "running..."}</span>
                              </div>
                              {isFailed && latest.error_code && <Badge variant="destructive" className="text-[8px] mt-0.5 h-4 px-1">{latest.error_code}</Badge>}
                              {isFailed && lastSuccess && <p className="text-[9px] text-muted-foreground mt-0.5">Last OK: {formatDistanceToNow(new Date(lastSuccess.completed_at), { addSuffix: true })}</p>}
                              {isSuccess && latest.rows_synced > 0 && <p className="text-[9px] text-muted-foreground">{latest.rows_synced} rows</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
