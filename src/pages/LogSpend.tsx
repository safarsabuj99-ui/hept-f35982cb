import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingDown, ShieldAlert } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

interface ClientProfile { user_id: string; full_name: string; business_name: string | null; }

const platforms = [
  { value: "meta", label: "Meta (Facebook)" },
  { value: "tiktok", label: "TikTok" },
  { value: "google", label: "Google Ads" },
] as const;

export default function LogSpend() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [clientId, setClientId] = useState("");
  const [platform, setPlatform] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { user, role } = useAuth();
  const { toast } = useToast();
  const { exchangeRate } = useCurrency();
  const { permissions } = usePermissions();
  const navigate = useNavigate();
  const isManager = role === "manager";
  const backPath = isManager ? "/manager" : "/admin";

  useEffect(() => {
    const fetchClients = async () => {
      if (isManager) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, business_name, manager_id" as any);
        setClients((profiles ?? []).filter((p: any) => p.manager_id === user?.id) as unknown as ClientProfile[]);
      } else {
        const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
        const clientIds = roles?.map((r) => r.user_id) ?? [];
        if (clientIds.length === 0) return;
        const { data: profiles } = await supabase
          .from("profiles").select("user_id, full_name, business_name").in("user_id", clientIds);
        setClients(profiles ?? []);
      }
    };
    fetchClients();
  }, [isManager, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !platform || !amount || Number(amount) <= 0) return;
    setIsLoading(true);

    // Daily spend does NOT require approval — always completed
    const { error } = await supabase.from("transactions").insert({
      client_id: clientId,
      type: "debit" as const,
      amount: Number(amount),
      platform: platform as "meta" | "tiktok" | "google",
      date,
      description: description || `${platforms.find((p) => p.value === platform)?.label} ad spend`,
      created_by: user!.id,
      status: "completed",
      exchange_rate: exchangeRate,
    } as any);

    setIsLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: `$${Number(amount).toFixed(2)} spend logged` });
      navigate(backPath);
    }
  };

  if (isManager && !permissions.can_log_spend) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium">Access Restricted</p>
            <p className="text-sm text-muted-foreground text-center">You don't have permission to log spend. Contact your admin to update your permissions.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <TrendingDown className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle>Log Daily Spend</CardTitle>
              <CardDescription>Record ad platform spending for a client</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.full_name} {c.business_name ? `(${c.business_name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                <SelectContent>
                  {platforms.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (USD)</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
              {amount && Number(amount) > 0 && (
                <p className="text-xs text-muted-foreground">≈ ৳{(Number(amount) * exchangeRate).toFixed(2)} BDT</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Campaign name" />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Log Spend
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
