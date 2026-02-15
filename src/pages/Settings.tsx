import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings as SettingsIcon } from "lucide-react";

export default function Settings() {
  const [exchangeRate, setExchangeRate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    supabase
      .from("settings" as any)
      .select("value")
      .eq("key", "exchange_rate")
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.value) setExchangeRate(data.value);
        setLoading(false);
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exchangeRate || Number(exchangeRate) <= 0) return;
    setSaving(true);

    const { error } = await (supabase.from("settings" as any) as any)
      .update({ value: exchangeRate, updated_by: user?.id })
      .eq("key", "exchange_rate");

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `Exchange rate updated to ${exchangeRate} BDT/USD` });
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Global configuration</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <SettingsIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Exchange Rate</CardTitle>
              <CardDescription>Set the USD to BDT conversion rate</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label>1 USD = ? BDT</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  placeholder="120.00"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  This rate is used for converting USD amounts to BDT in dashboards
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Exchange Rate
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
