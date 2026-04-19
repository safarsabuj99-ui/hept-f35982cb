import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, Save, CheckCircle2, Clock, Sparkles, Settings2, AlertCircle, Target, BarChart3 } from "lucide-react";
import { FailedJob, SyncErrorPanel } from "./SyncErrorPanel";

const PLATFORMS = [
  { key: "meta", label: "Meta", color: "from-blue-600 to-blue-500", initial: "M" },
  { key: "tiktok", label: "TikTok", color: "from-pink-500 to-rose-500", initial: "T" },
  { key: "google", label: "Google", color: "from-amber-500 to-orange-500", initial: "G" },
] as const;

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

interface Props {
  failedJobs: FailedJob[];
  onRefresh: () => void;
}

export function SyncControlsAccordion({ failedJobs, onRefresh }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<Record<string, string>>({});
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [adAccounts, setAdAccounts] = useState<{ id: string; account_name: string; ad_account_id: string; platform_name: string }[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [syncingAccount, setSyncingAccount] = useState(false);

  useEffect(() => {
    supabase.from("settings" as any).select("key, value").in("key", SCHEDULE_ROWS.map(r => r.key)).then(({ data }: any) => {
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[row.key] = row.value;
      for (const r of SCHEDULE_ROWS) { if (!map[r.key]) map[r.key] = r.recommended; }
      setSchedules(map);
    });
    supabase.from("api_integrations").select("last_synced_at").order("last_synced_at", { ascending: false }).limit(1).single()
      .then(({ data }) => { if (data?.last_synced_at) setLastSyncedAt(data.last_synced_at); });
    supabase.from("ad_accounts").select("id, account_name, ad_account_id, platform_name").eq("is_active", true).order("account_name")
      .then(({ data }) => setAdAccounts(data ?? []));
  }, []);

  const handlePlatformSync = async (platform: string) => {
    const key = `sync-deep-dive:${platform}`;
    setSyncing(p => ({ ...p, [key]: true }));
    const { error } = await supabase.functions.invoke("sync-deep-dive", { body: { platform } });
    setSyncing(p => ({ ...p, [key]: false }));
    if (error) toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Sync triggered", description: `${platform} deep dive started` }); onRefresh(); }
  };

  const handleSyncAll = async () => {
    setSyncing(p => ({ ...p, all: true }));
    const { error } = await supabase.functions.invoke("sync-orchestrator", { body: { function: "sync-deep-dive" } });
    setSyncing(p => ({ ...p, all: false }));
    if (error) toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    else { toast({ title: "All platforms queued" }); onRefresh(); }
  };

  const handleAccountSync = async () => {
    if (!selectedAccountId) return;
    setSyncingAccount(true);
    const { error } = await supabase.functions.invoke("sync-deep-dive", { body: { ad_account_ids: [selectedAccountId] } });
    setSyncingAccount(false);
    if (error) toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Account sync queued" }); onRefresh(); }
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    let hasError = false;
    for (const row of SCHEDULE_ROWS) {
      const { error } = await (supabase.from("settings" as any) as any).update({ value: schedules[row.key] || row.recommended, updated_by: user?.id }).eq("key", row.key);
      if (error) hasError = true;
    }
    setSavingSchedule(false);
    toast(hasError ? { title: "Error", description: "Some settings could not be saved", variant: "destructive" } : { title: "Schedule saved" });
  };

  return (
    <Accordion type="multiple" defaultValue={["manual"]} className="space-y-3">
      {/* Manual Sync */}
      <AccordionItem value="manual" className="rounded-2xl border bg-card/40 px-5 data-[state=open]:bg-card/60 transition-colors">
        <AccordionTrigger className="hover:no-underline py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <RefreshCw className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm">Manual Sync</p>
              <p className="text-xs text-muted-foreground">Trigger sync for any platform or single account</p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-5 space-y-4">
          {/* Platform tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PLATFORMS.map(p => {
              const key = `sync-deep-dive:${p.key}`;
              const isSyncing = syncing[key];
              return (
                <button
                  key={p.key}
                  disabled={isSyncing || syncing.all}
                  onClick={() => handlePlatformSync(p.key)}
                  className={cn(
                    "group relative rounded-xl p-4 text-left overflow-hidden transition-all",
                    "border bg-card hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  )}
                >
                  <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-10 bg-gradient-to-br transition-opacity", p.color)} />
                  <div className="relative flex items-center gap-3">
                    <div className={cn("h-11 w-11 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-bold shadow-md", p.color)}>
                      {isSyncing ? <Loader2 className="h-5 w-5 animate-spin" /> : p.initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{p.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {isSyncing ? "Syncing now…" : "Click to sync"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Single account sync */}
          <div className="rounded-xl border bg-background/40 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-medium">Sync a specific account</p>
            </div>
            <div className="flex gap-2">
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="flex-1 h-9"><SelectValue placeholder="Select ad account…" /></SelectTrigger>
                <SelectContent>
                  {adAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.account_name || a.ad_account_id} <span className="text-muted-foreground">({a.platform_name})</span></SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={!selectedAccountId || syncingAccount} onClick={handleAccountSync} className="h-9 gap-1.5">
                {syncingAccount ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
                Sync
              </Button>
            </div>
          </div>

          <Button className="w-full gap-2 shadow-md" disabled={syncing.all} onClick={handleSyncAll}>
            {syncing.all ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Sync All Platforms
          </Button>
          {lastSyncedAt && (
            <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" /> Last synced {formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}
            </p>
          )}
        </AccordionContent>
      </AccordionItem>

      {/* Schedule */}
      <AccordionItem value="schedule" className="rounded-2xl border bg-card/40 px-5 data-[state=open]:bg-card/60 transition-colors">
        <AccordionTrigger className="hover:no-underline py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Settings2 className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm">Sync Schedule</p>
              <p className="text-xs text-muted-foreground">Per-platform sync intervals</p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-5 space-y-3">
          {SCHEDULE_ROWS.map(row => {
            const current = schedules[row.key] || row.recommended;
            const isOptimal = current === row.recommended;
            return (
              <div key={row.key} className="flex items-center gap-3 rounded-xl border bg-background/40 p-3 hover:bg-background/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{row.label}</span>
                    {row.platform !== "all" && <Badge variant="outline" className="text-[10px] capitalize h-4 px-1.5">{row.platform}</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{row.reason}</p>
                </div>
                <Select value={current} onValueChange={v => setSchedules(p => ({ ...p, [row.key]: v }))}>
                  <SelectTrigger className="w-[110px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{INTERVAL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
                {isOptimal ? (
                  <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px] gap-1 h-6 px-2">
                    <Sparkles className="h-2.5 w-2.5" /> Optimal
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground h-6 px-2">Rec: {row.recommendedLabel}</Badge>
                )}
              </div>
            );
          })}
          <Button onClick={handleSaveSchedule} className="w-full gap-2" disabled={savingSchedule}>
            {savingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Schedule
          </Button>
        </AccordionContent>
      </AccordionItem>

      {/* Errors */}
      <AccordionItem value="errors" className={cn(
        "rounded-2xl border px-5 transition-colors",
        failedJobs.length === 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-destructive/5 border-destructive/20 data-[state=open]:bg-destructive/10"
      )}>
        <AccordionTrigger className="hover:no-underline py-4">
          <div className="flex items-center gap-3">
            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center",
              failedJobs.length === 0 ? "bg-emerald-500/15" : "bg-destructive/15"
            )}>
              {failedJobs.length === 0
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                : <AlertCircle className="h-4 w-4 text-destructive" />}
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm">Errors & Retry</p>
              <p className="text-xs text-muted-foreground">
                {failedJobs.length === 0 ? "No failures — everything is healthy" : `${failedJobs.length} failed job${failedJobs.length === 1 ? "" : "s"} need attention`}
              </p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-5">
          <SyncErrorPanel jobs={failedJobs} onRefresh={onRefresh} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
