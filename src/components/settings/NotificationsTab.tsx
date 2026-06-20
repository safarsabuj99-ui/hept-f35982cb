import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bell, Volume2, Moon, Mail, Sparkles, Shield, CreditCard, Megaphone, Settings2, Send, RefreshCw, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { setNotifSoundEnabled } from "@/hooks/useNotifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const NOTIF_TYPES = ["payment", "guard", "campaign", "system"] as const;
const TYPE_LABELS: Record<string, string> = { payment: "Payment", guard: "Ad Guard", campaign: "Campaign", system: "System" };
const TYPE_ICONS: Record<string, React.ElementType> = { payment: CreditCard, guard: Shield, campaign: Megaphone, system: Settings2 };
const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent only" },
];

interface Pref { id: string; channel: string; type: string; enabled: boolean; min_priority?: string; }
interface UserSettings {
  user_id: string;
  quiet_start: string | null;
  quiet_end: string | null;
  dnd_until: string | null;
  digest_enabled: boolean;
}

export function NotificationsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("notif_sound_enabled") !== "false");

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      (supabase.from("notification_preferences" as any) as any).select("*").eq("user_id", user.id),
      (supabase.from("notification_user_settings" as any) as any).select("*").eq("user_id", user.id).maybeSingle(),
    ]).then(([prefRes, setRes]: any[]) => {
      // Merge with defaults
      const existing: Pref[] = prefRes.data || [];
      const merged: Pref[] = [];
      for (const ch of ["in_app", "push"]) {
        for (const t of NOTIF_TYPES) {
          const found = existing.find((p) => p.channel === ch && p.type === t);
          merged.push(found || { id: `${ch}_${t}`, channel: ch, type: t, enabled: true, min_priority: "low" });
        }
      }
      setPrefs(merged);
      setSettings(setRes.data || {
        user_id: user.id, quiet_start: null, quiet_end: null, dnd_until: null, digest_enabled: false,
      });
      setLoading(false);
    });
  }, [user?.id]);

  const upsertPref = async (channel: string, type: string, patch: Partial<Pref>) => {
    if (!user?.id) return;
    const existing = prefs.find((p) => p.channel === channel && p.type === type);
    const merged = { ...existing, ...patch, channel, type };
    setPrefs((prev) => prev.map((p) => (p.channel === channel && p.type === type ? { ...p, ...patch } : p)));
    const { error } = await (supabase.from("notification_preferences" as any) as any)
      .upsert(
        { user_id: user.id, channel, type, enabled: merged.enabled ?? true, min_priority: merged.min_priority ?? "low", updated_at: new Date().toISOString() },
        { onConflict: "user_id,channel,type" }
      );
    if (error) toast({ title: "Error", description: "Failed to save", variant: "destructive" });
  };

  const updateSettings = async (patch: Partial<UserSettings>) => {
    if (!user?.id || !settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    const { error } = await (supabase.from("notification_user_settings" as any) as any).upsert(
      { user_id: user.id, ...patch },
      { onConflict: "user_id" }
    );
    if (error) toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
  };

  const handleSoundToggle = () => {
    const next = !soundOn;
    setSoundOn(next);
    setNotifSoundEnabled(next);
  };

  const setDnd = (hours: number | null) => {
    const until = hours ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : null;
    updateSettings({ dnd_until: until });
    toast({ title: hours ? `DND on for ${hours}h` : "DND cleared" });
  };

  const dndActive = settings?.dnd_until && new Date(settings.dnd_until) > new Date();

  if (loading) {
    return (
      <div className="glass-card glow-border rounded-xl p-8 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* === Smart Controls === */}
      <div className="glass-card glow-border rounded-xl overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" /> Smart Controls
          </CardTitle>
          <CardDescription>Reduce noise. Stay focused. Never miss what matters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* DND */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <Moon className={cn("h-4 w-4", dndActive ? "text-primary" : "text-muted-foreground")} />
              <div>
                <p className="text-sm font-medium">Do Not Disturb</p>
                <p className="text-xs text-muted-foreground">
                  {dndActive ? `Active until ${new Date(settings!.dnd_until!).toLocaleString()}` : "Silence everything except urgent alerts"}
                </p>
              </div>
            </div>
            <div className="flex gap-1.5">
              {dndActive ? (
                <Button variant="outline" size="sm" onClick={() => setDnd(null)}>End</Button>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setDnd(1)}>1h</Button>
                  <Button variant="outline" size="sm" onClick={() => setDnd(4)}>4h</Button>
                  <Button variant="outline" size="sm" onClick={() => setDnd(8)}>Tomorrow</Button>
                </>
              )}
            </div>
          </div>

          {/* Quiet hours */}
          <div className="p-3 bg-muted/50 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Quiet Hours</p>
                <p className="text-xs text-muted-foreground">Mute non-urgent pushes during your sleep window (Asia/Dhaka)</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start</Label>
                <Input
                  type="time"
                  value={settings?.quiet_start || ""}
                  onChange={(e) => updateSettings({ quiet_start: e.target.value || null })}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs">End</Label>
                <Input
                  type="time"
                  value={settings?.quiet_end || ""}
                  onChange={(e) => updateSettings({ quiet_end: e.target.value || null })}
                  className="h-9"
                />
              </div>
            </div>
            {settings?.quiet_start && settings?.quiet_end && (
              <Button variant="ghost" size="sm" onClick={() => updateSettings({ quiet_start: null, quiet_end: null })}>
                Clear quiet hours
              </Button>
            )}
          </div>

          {/* Digest */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Daily Digest</p>
                <p className="text-xs text-muted-foreground">Bundle low-priority alerts into one daily summary at 9am</p>
              </div>
            </div>
            <Switch
              checked={settings?.digest_enabled ?? false}
              onCheckedChange={(v) => updateSettings({ digest_enabled: v })}
            />
          </div>

          {/* Sound */}
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
        </CardContent>
      </div>

      {/* === Per-type matrix === */}
      <div className="glass-card glow-border rounded-xl overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5" /> Smart Rules per Type
          </CardTitle>
          <CardDescription>Choose what gets through and at what minimum priority</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_70px_70px_140px] gap-0">
              <div className="p-3 bg-muted/50 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground">Type</div>
              <div className="p-3 bg-muted/50 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground text-center">In-App</div>
              <div className="p-3 bg-muted/50 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground text-center">Push</div>
              <div className="p-3 bg-muted/50 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground text-center">Min Priority (Push)</div>

              {NOTIF_TYPES.map((type, i) => {
                const Icon = TYPE_ICONS[type];
                const inApp = prefs.find((p) => p.channel === "in_app" && p.type === type);
                const push = prefs.find((p) => p.channel === "push" && p.type === type);
                return (
                  <div key={type} className="contents">
                    <div className={cn("p-3 text-sm font-medium border-t flex items-center gap-2", i % 2 === 0 && "bg-muted/20")}>
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {TYPE_LABELS[type]}
                    </div>
                    <div className={cn("p-3 border-t flex items-center justify-center", i % 2 === 0 && "bg-muted/20")}>
                      <Switch checked={inApp?.enabled ?? true} onCheckedChange={(v) => upsertPref("in_app", type, { enabled: v })} />
                    </div>
                    <div className={cn("p-3 border-t flex items-center justify-center", i % 2 === 0 && "bg-muted/20")}>
                      <Switch checked={push?.enabled ?? true} onCheckedChange={(v) => upsertPref("push", type, { enabled: v })} />
                    </div>
                    <div className={cn("p-3 border-t flex items-center justify-center", i % 2 === 0 && "bg-muted/20")}>
                      <Select
                        value={push?.min_priority || "low"}
                        onValueChange={(v) => upsertPref("push", type, { min_priority: v })}
                        disabled={!push?.enabled}
                      >
                        <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map((p) => (
                            <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Tip: Setting <strong>Min Priority = High</strong> on Campaign means routine campaign updates land silently in your inbox; only high/urgent ones push to your device.
          </p>
        </CardContent>
      </div>
    </div>
  );
}
