import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Percent, CalendarIcon, Globe, Bell, Volume2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { setNotifSoundEnabled } from "@/hooks/useNotifications";

export default function Settings() {
  const [serviceMargin, setServiceMargin] = useState("");
  const [syncStartDate, setSyncStartDate] = useState<Date | undefined>();
  const [savingSyncDate, setSavingSyncDate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingMargin, setSavingMargin] = useState(false);
  const [tiktokProxyUrl, setTiktokProxyUrl] = useState("");
  const [savingProxy, setSavingProxy] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

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
      toast({ title: "Saved", description: tiktokProxyUrl.trim() ? "TikTok proxy URL configured." : "TikTok proxy removed." });
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="animate-slide-up-fade">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Global configuration</p>
      </div>

      <div className="glass-card glow-border opacity-0 animate-slide-up-fade stagger-2">
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
      </div>

      <div className="glass-card glow-border opacity-0 animate-slide-up-fade stagger-3">
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
      </div>

      <div className="glass-card glow-border opacity-0 animate-slide-up-fade stagger-4">
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
      </div>

      {/* Notification Preferences */}
      <NotificationPreferences userId={user?.id} />
    </div>
  );
}

// --- Notification Preferences Component ---
const NOTIF_TYPES = ["payment", "guard", "campaign", "system"] as const;
const NOTIF_CHANNELS = ["in_app", "push"] as const;
const TYPE_LABELS: Record<string, string> = { payment: "Payment", guard: "Ad Guard", campaign: "Campaign", system: "System" };
const CHANNEL_LABELS: Record<string, string> = { in_app: "In-App", push: "Push" };

interface Pref { id: string; channel: string; type: string; enabled: boolean; }

function NotificationPreferences({ userId }: { userId?: string }) {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("notif_sound_enabled") !== "false");
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("notification_preferences" as any)
      .select("*")
      .eq("user_id", userId)
      .then(({ data }: any) => {
        if (data?.length) {
          setPrefs(data);
        } else {
          // Seed defaults if none exist
          const defaults: Pref[] = [];
          for (const ch of NOTIF_CHANNELS) {
            for (const t of NOTIF_TYPES) {
              defaults.push({ id: `${ch}_${t}`, channel: ch, type: t, enabled: true });
            }
          }
          setPrefs(defaults);
        }
        setLoadingPrefs(false);
      });
  }, [userId]);

  const togglePref = async (channel: string, type: string) => {
    if (!userId) return;
    const existing = prefs.find((p) => p.channel === channel && p.type === type);
    const newVal = existing ? !existing.enabled : false;

    // Optimistic update
    setPrefs((prev) =>
      prev.map((p) => (p.channel === channel && p.type === type ? { ...p, enabled: newVal } : p))
    );

    const { error } = await (supabase.from("notification_preferences" as any) as any)
      .upsert(
        { user_id: userId, channel, type, enabled: newVal, updated_at: new Date().toISOString() },
        { onConflict: "user_id,channel,type" }
      );

    if (error) {
      toast({ title: "Error", description: "Failed to update preference", variant: "destructive" });
      setPrefs((prev) =>
        prev.map((p) => (p.channel === channel && p.type === type ? { ...p, enabled: !newVal } : p))
      );
    }
  };

  const handleSoundToggle = () => {
    const next = !soundOn;
    setSoundOn(next);
    setNotifSoundEnabled(next);
  };

  return (
    <div className="glass-card glow-border rounded-xl overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5" /> Notification Preferences
        </CardTitle>
        <CardDescription>Control which notifications you receive and how</CardDescription>
      </CardHeader>
      <CardContent>
        {loadingPrefs ? (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-6">
            {/* Sound toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Notification Sound</p>
                  <p className="text-xs text-muted-foreground">Play a chime for urgent & high priority alerts</p>
                </div>
              </div>
              <Switch checked={soundOn} onCheckedChange={handleSoundToggle} />
            </div>

            {/* Preferences matrix */}
            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_80px] gap-0">
                {/* Header */}
                <div className="p-3 bg-muted/50 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground">Type</div>
                {NOTIF_CHANNELS.map((ch) => (
                  <div key={ch} className="p-3 bg-muted/50 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground text-center">
                    {CHANNEL_LABELS[ch]}
                  </div>
                ))}

                {/* Rows */}
                {NOTIF_TYPES.map((type, i) => (
                  <>
                    <div key={`label-${type}`} className={cn("p-3 text-sm font-medium border-t flex items-center", i % 2 === 0 && "bg-muted/20")}>
                      {TYPE_LABELS[type]}
                    </div>
                    {NOTIF_CHANNELS.map((ch) => {
                      const pref = prefs.find((p) => p.channel === ch && p.type === type);
                      return (
                        <div key={`${ch}-${type}`} className={cn("p-3 border-t flex items-center justify-center", i % 2 === 0 && "bg-muted/20")}>
                          <Switch
                            checked={pref?.enabled ?? true}
                            onCheckedChange={() => togglePref(ch, type)}
                          />
                        </div>
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </div>
  );
}
