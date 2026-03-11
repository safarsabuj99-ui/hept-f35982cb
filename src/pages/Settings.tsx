import { useState, useEffect } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Percent, CalendarIcon, Zap, RefreshCw, BarChart3, DollarSign, Bell, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type SyncFunction = "sync-fast-lane" | "sync-deep-dive" | "sync-ad-spend" | "billing-radar";

const SYNC_FUNCTIONS: { key: SyncFunction; label: string; icon: React.ReactNode; description: string }[] = [
  { key: "sync-fast-lane", label: "Fast Lane", icon: <Zap className="h-4 w-4" />, description: "Quick campaign metrics" },
  { key: "sync-deep-dive", label: "Deep Dive", icon: <BarChart3 className="h-4 w-4" />, description: "Detailed performance data" },
  { key: "sync-ad-spend", label: "Ad Spend", icon: <DollarSign className="h-4 w-4" />, description: "Daily spend records" },
  { key: "billing-radar", label: "Billing", icon: <Bell className="h-4 w-4" />, description: "Threshold alerts" },
];

export default function Settings() {
  const [serviceMargin, setServiceMargin] = useState("");
  const [syncStartDate, setSyncStartDate] = useState<Date | undefined>();
  const [savingSyncDate, setSavingSyncDate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingMargin, setSavingMargin] = useState(false);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [tiktokProxyUrl, setTiktokProxyUrl] = useState("");
  const [savingProxy, setSavingProxy] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchLastSynced = async () => {
    const { data } = await supabase
      .from("api_integrations")
      .select("last_synced_at")
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .single();
    if (data?.last_synced_at) setLastSyncedAt(data.last_synced_at);
  };

  useEffect(() => {
    supabase
      .from("settings" as any)
      .select("key, value")
      .in("key", ["service_margin_percentage", "sync_start_date", "tiktok_proxy_url"])
      .then(({ data }: any) => {
        for (const row of data ?? []) {
          if (row.key === "service_margin_percentage") setServiceMargin(row.value);
          if (row.key === "sync_start_date") setSyncStartDate(new Date(row.value + "T00:00:00"));
          if (row.key === "tiktok_proxy_url") setTiktokProxyUrl(row.value || "");
        }
        setLoading(false);
      });
    fetchLastSynced();
  }, []);

  const handleSaveMargin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (serviceMargin === "" || Number(serviceMargin) < 0) return;
    setSavingMargin(true);
    const { error } = await (supabase.from("settings" as any) as any)
      .update({ value: serviceMargin, updated_by: user?.id })
      .eq("key", "service_margin_percentage");
    setSavingMargin(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `Service margin set to ${serviceMargin}%` });
    }
  };

  const handleSaveSyncDate = async () => {
    if (!syncStartDate) return;
    setSavingSyncDate(true);
    const dateStr = format(syncStartDate, "yyyy-MM-dd");
    const { error } = await (supabase.from("settings" as any) as any)
      .update({ value: dateStr, updated_by: user?.id })
      .eq("key", "sync_start_date");
    setSavingSyncDate(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `Sync start date set to ${dateStr}. Next sync will import from this date.` });
    }
  };

  const handleSaveProxy = async () => {
    setSavingProxy(true);
    const { error } = await (supabase.from("settings" as any) as any)
      .update({ value: tiktokProxyUrl.trim(), updated_by: user?.id })
      .eq("key", "tiktok_proxy_url");
    setSavingProxy(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: tiktokProxyUrl.trim() ? "TikTok proxy URL configured. Next sync will use it." : "TikTok proxy removed. Direct API calls will be used." });
    }
  };

  const handleManualSync = async (fn: SyncFunction, platform?: string) => {
    const syncKey = platform ? `${fn}:${platform}` : fn;
    setSyncing((prev) => ({ ...prev, [syncKey]: true }));
    const body = platform ? { platform } : undefined;
    const { data, error } = await supabase.functions.invoke(fn, { body });
    setSyncing((prev) => ({ ...prev, [syncKey]: false }));
    if (error) {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    } else {
      const label = platform ? `${fn} (${platform})` : fn;
      toast({ title: "Sync Complete", description: data?.message || `${label} finished successfully.` });
      if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
        for (const err of data.errors) {
          toast({ title: "Sync Warning", description: typeof err === "string" ? err : JSON.stringify(err), variant: "destructive" });
        }
      }
      fetchLastSynced();
    }
  };

  const handleSyncAll = async () => {
    setSyncing((prev) => ({ ...prev, all: true }));
    for (const fn of SYNC_FUNCTIONS) {
      setSyncing((prev) => ({ ...prev, [fn.key]: true }));
      const { data, error } = await supabase.functions.invoke(fn.key);
      setSyncing((prev) => ({ ...prev, [fn.key]: false }));
      if (error) {
        toast({ title: `${fn.label} Failed`, description: error.message, variant: "destructive" });
      } else if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
        for (const err of data.errors) {
          toast({ title: `${fn.label} Warning`, description: typeof err === "string" ? err : JSON.stringify(err), variant: "destructive" });
        }
      }
    }
    setSyncing((prev) => ({ ...prev, all: false }));
    toast({ title: "All Syncs Complete", description: "All API data has been refreshed." });
    fetchLastSynced();
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Global configuration</p>
      </div>

      {/* Manual API Sync Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <RefreshCw className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Manual API Sync</CardTitle>
              <CardDescription>Trigger data collection instantly</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {SYNC_FUNCTIONS.map((fn) => (
              <Button
                key={fn.key}
                variant="outline"
                className="justify-start gap-2"
                disabled={syncing[fn.key] || syncing.all}
                onClick={() => handleManualSync(fn.key)}
              >
                {syncing[fn.key] ? <Loader2 className="h-4 w-4 animate-spin" /> : fn.icon}
                {fn.label}
              </Button>
            ))}
          </div>
          {/* Per-platform Deep Dive sync */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Deep Dive by Platform</p>
            <div className="grid grid-cols-3 gap-2">
              {(["meta", "google", "tiktok"] as const).map((platform) => {
                const syncKey = `sync-deep-dive:${platform}`;
                const anySyncing = Object.values(syncing).some(Boolean);
                return (
                  <Button
                    key={platform}
                    variant="outline"
                    size="sm"
                    className="gap-1.5 capitalize"
                    disabled={syncing[syncKey] || anySyncing}
                    onClick={() => handleManualSync("sync-deep-dive", platform)}
                  >
                    {syncing[syncKey] ? <Loader2 className="h-3 w-3 animate-spin" /> : <BarChart3 className="h-3 w-3" />}
                    {platform === "meta" ? "Meta" : platform === "google" ? "Google" : "TikTok"}
                  </Button>
                );
              })}
            </div>
          </div>
          <Button
            className="w-full"
            disabled={syncing.all || Object.values(syncing).some(Boolean)}
            onClick={handleSyncAll}
          >
            {syncing.all ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sync All
          </Button>
          {lastSyncedAt && (
            <p className="text-xs text-muted-foreground text-center">
              Last synced: {formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Percent className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Service Margin</CardTitle>
              <CardDescription>Percentage margin applied to client billing</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <form onSubmit={handleSaveMargin} className="space-y-4">
              <div className="space-y-2">
                <Label>Margin %</Label>
                <Input type="number" step="0.1" min="0" value={serviceMargin} onChange={(e) => setServiceMargin(e.target.value)} placeholder="0" required />
                <p className="text-xs text-muted-foreground">Applied on top of actual ad spend when billing clients</p>
              </div>
              <Button type="submit" className="w-full" disabled={savingMargin}>
                {savingMargin ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Margin
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <CalendarIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Sync Start Date</CardTitle>
              <CardDescription>Import ad data starting from this date</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !syncStartDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {syncStartDate ? format(syncStartDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={syncStartDate}
                      onSelect={setSyncStartDate}
                      disabled={(date) => date > new Date()}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">All sync functions will import data from this date to today</p>
              </div>
              <Button onClick={handleSaveSyncDate} className="w-full" disabled={savingSyncDate || !syncStartDate}>
                {savingSyncDate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Sync Date
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>TikTok API Proxy</CardTitle>
              <CardDescription>Route TikTok calls through a proxy to bypass geo-restrictions</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Proxy Base URL</Label>
                <Input
                  type="url"
                  value={tiktokProxyUrl}
                  onChange={(e) => setTiktokProxyUrl(e.target.value)}
                  placeholder="https://your-proxy.workers.dev"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty for direct API calls. Set to a relay server URL to bypass TikTok error 41000 (geo-restriction).
                </p>
              </div>
              <Button onClick={handleSaveProxy} className="w-full" disabled={savingProxy}>
                {savingProxy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Proxy URL
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
