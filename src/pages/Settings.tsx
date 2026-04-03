import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Percent, CalendarIcon, Globe } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
