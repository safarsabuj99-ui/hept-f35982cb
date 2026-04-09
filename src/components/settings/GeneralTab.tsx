import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CalendarIcon, Globe, Sun, Moon, DollarSign, Palette, Monitor, Smartphone } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/hooks/useCurrency";
import { Separator } from "@/components/ui/separator";

export function GeneralTab() {
  const [syncStartDate, setSyncStartDate] = useState<Date | undefined>();
  const [savingSyncDate, setSavingSyncDate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tiktokProxyUrl, setTiktokProxyUrl] = useState("");
  const [savingProxy, setSavingProxy] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem("theme") !== "light");
  const { user } = useAuth();
  const { toast } = useToast();
  const { currency, toggleCurrency } = useCurrency();

  useEffect(() => {
    supabase
      .from("settings" as any)
      .select("key, value")
      .in("key", ["sync_start_date", "tiktok_proxy_url"])
      .then(({ data }: any) => {
        for (const row of data ?? []) {
          if (row.key === "sync_start_date") setSyncStartDate(new Date(row.value + "T00:00:00"));
          if (row.key === "tiktok_proxy_url") setTiktokProxyUrl(row.value || "");
        }
        setLoading(false);
      });
  }, []);

  const handleToggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
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
      toast({ title: "Saved", description: `Sync start date set to ${dateStr}.` });
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
    <div className="space-y-8 animate-slide-up-fade">
      {/* ── Appearance & Display ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Palette className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Appearance & Display</h2>
            <p className="text-xs text-muted-foreground">Theme and currency preferences</p>
          </div>
        </div>

        <div className="glass-card glow-border overflow-hidden">
          <div className="divide-y divide-border">
            {/* Theme toggle */}
            <div className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                  {dark ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-warning" />}
                </div>
                <div>
                  <p className="text-sm font-medium">Dark Mode</p>
                  <p className="text-xs text-muted-foreground">
                    {dark ? "Dark theme active" : "Light theme active"}
                  </p>
                </div>
              </div>
              <Switch checked={dark} onCheckedChange={handleToggleTheme} />
            </div>

            {/* Currency toggle */}
            <div className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Display Currency</p>
                  <p className="text-xs text-muted-foreground">Currently showing amounts in <span className="font-mono font-semibold text-foreground">{currency}</span></p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={toggleCurrency} className="min-w-[110px] font-mono text-xs">
                Switch to {currency === "USD" ? "BDT" : "USD"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Data Sync Configuration ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <CalendarIcon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Data Sync</h2>
            <p className="text-xs text-muted-foreground">Configure how ad data is imported</p>
          </div>
        </div>

        <div className="glass-card glow-border">
          <CardContent className="p-5">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Sync Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-11", !syncStartDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {syncStartDate ? format(syncStartDate, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={syncStartDate} onSelect={setSyncStartDate} disabled={(date) => date > new Date()} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">All sync functions will import data from this date to today. Changing this affects the next sync cycle.</p>
                </div>
                <Button onClick={handleSaveSyncDate} className="w-full h-10" disabled={savingSyncDate || !syncStartDate}>
                  {savingSyncDate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Sync Date
                </Button>
              </div>
            )}
          </CardContent>
        </div>
      </section>

      {/* ── Network & Proxy ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Globe className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Network & Proxy</h2>
            <p className="text-xs text-muted-foreground">Route API calls through a proxy to bypass geo-restrictions</p>
          </div>
        </div>

        <div className="glass-card glow-border">
          <CardContent className="p-5">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">TikTok API Proxy URL</Label>
                  <Input
                    type="url"
                    value={tiktokProxyUrl}
                    onChange={(e) => setTiktokProxyUrl(e.target.value)}
                    placeholder="https://your-proxy.workers.dev"
                    className="h-11 font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">Leave empty for direct API calls. Only applies to TikTok data sync.</p>
                </div>
                <Button onClick={handleSaveProxy} className="w-full h-10" disabled={savingProxy}>
                  {savingProxy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Proxy URL
                </Button>
              </div>
            )}
          </CardContent>
        </div>
      </section>
    </div>
  );
}
