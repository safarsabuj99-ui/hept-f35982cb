import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bell, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { setNotifSoundEnabled } from "@/hooks/useNotifications";

const NOTIF_TYPES = ["payment", "guard", "campaign", "system"] as const;
const NOTIF_CHANNELS = ["in_app", "push"] as const;
const TYPE_LABELS: Record<string, string> = { payment: "Payment", guard: "Ad Guard", campaign: "Campaign", system: "System" };
const CHANNEL_LABELS: Record<string, string> = { in_app: "In-App", push: "Push" };

interface Pref { id: string; channel: string; type: string; enabled: boolean; }

export function NotificationsTab() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("notif_sound_enabled") !== "false");
  const { toast } = useToast();

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("notification_preferences" as any)
      .select("*")
      .eq("user_id", user.id)
      .then(({ data }: any) => {
        if (data?.length) {
          setPrefs(data);
        } else {
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
  }, [user?.id]);

  const togglePref = async (channel: string, type: string) => {
    if (!user?.id) return;
    const existing = prefs.find((p) => p.channel === channel && p.type === type);
    const newVal = existing ? !existing.enabled : false;
    setPrefs((prev) => prev.map((p) => (p.channel === channel && p.type === type ? { ...p, enabled: newVal } : p)));
    const { error } = await (supabase.from("notification_preferences" as any) as any)
      .upsert({ user_id: user.id, channel, type, enabled: newVal, updated_at: new Date().toISOString() }, { onConflict: "user_id,channel,type" });
    if (error) {
      toast({ title: "Error", description: "Failed to update preference", variant: "destructive" });
      setPrefs((prev) => prev.map((p) => (p.channel === channel && p.type === type ? { ...p, enabled: !newVal } : p)));
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
        <CardTitle className="flex items-center gap-2 text-lg"><Bell className="h-5 w-5" /> Notification Preferences</CardTitle>
        <CardDescription>Control which notifications you receive and how</CardDescription>
      </CardHeader>
      <CardContent>
        {loadingPrefs ? (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-6">
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
            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_80px] gap-0">
                <div className="p-3 bg-muted/50 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground">Type</div>
                {NOTIF_CHANNELS.map((ch) => (
                  <div key={ch} className="p-3 bg-muted/50 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground text-center">
                    {CHANNEL_LABELS[ch]}
                  </div>
                ))}
                {NOTIF_TYPES.map((type, i) => (
                  <>{/* Fragment key handled by parent map */}
                    <div key={`label-${type}`} className={cn("p-3 text-sm font-medium border-t flex items-center", i % 2 === 0 && "bg-muted/20")}>
                      {TYPE_LABELS[type]}
                    </div>
                    {NOTIF_CHANNELS.map((ch) => {
                      const pref = prefs.find((p) => p.channel === ch && p.type === type);
                      return (
                        <div key={`${ch}-${type}`} className={cn("p-3 border-t flex items-center justify-center", i % 2 === 0 && "bg-muted/20")}>
                          <Switch checked={pref?.enabled ?? true} onCheckedChange={() => togglePref(ch, type)} />
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
