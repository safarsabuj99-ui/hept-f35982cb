import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import { CurrencyToggle } from "@/components/CurrencyToggle";
import { ProfitLossWidget } from "@/components/ProfitLossWidget";
import { LowBalanceAlerts } from "@/components/LowBalanceAlerts";
import { SpendTrendChart } from "@/components/SpendTrendChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { DollarSign, Users, TrendingUp, ClipboardCheck, Clock, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface ClientWithBalance {
  user_id: string;
  full_name: string;
  email: string;
  business_name: string | null;
  balance: number;
}

export default function AdminDashboard() {
  const [clients, setClients] = useState<ClientWithBalance[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [rateValue, setRateValue] = useState(120);
  const [rateSaving, setRateSaving] = useState(false);
  const { formatAmount, exchangeRate } = useCurrency();
  const { toast } = useToast();

  const fetchDataCb = useCallback(async () => {
    await fetchData();
  }, [exchangeRate]);

  useEffect(() => {
    fetchData();
  }, []);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('admin-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_ad_spend' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    const [profilesRes, rolesRes, txnsRes, pendingRes, syncRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, business_name"),
      supabase.from("user_roles").select("user_id").eq("role", "client"),
      supabase.from("transactions").select("*"),
      (supabase.from("transactions").select("id", { count: "exact" }) as any).eq("status", "pending_approval"),
      supabase.from("api_integrations" as any).select("last_synced_at").order("last_synced_at", { ascending: false }).limit(1) as any,
    ]);

    const clientUserIds = new Set(rolesRes.data?.map((r) => r.user_id) ?? []);
    const clientProfiles = (profilesRes.data ?? []).filter((p) => clientUserIds.has(p.user_id));
    const transactions = txnsRes.data ?? [];

    const result: ClientWithBalance[] = clientProfiles.map((p) => {
      const clientTxns = transactions.filter((t: any) => t.client_id === p.user_id && t.status === "completed");
      const credits = clientTxns.filter((t: any) => t.type === "credit").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const debits = clientTxns.filter((t: any) => t.type === "debit").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      return { ...p, balance: credits - debits };
    });

    setClients(result);
    setPendingCount(pendingRes.count ?? 0);
    setRateValue(exchangeRate);
    if (syncRes.data?.[0]?.last_synced_at) {
      setLastSynced(new Date(syncRes.data[0].last_synced_at).toLocaleString());
    }
    setLoading(false);
  };

  const saveRate = async () => {
    if (rateValue <= 0) return;
    setRateSaving(true);
    const { error } = await (supabase.from("settings" as any) as any)
      .update({ value: String(rateValue) })
      .eq("key", "exchange_rate");
    setRateSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `Exchange rate updated to ${rateValue} BDT/USD` });
    }
  };

  const totalBalance = clients.reduce((s, c) => s + c.balance, 0);
  const totalClients = clients.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Super Admin Dashboard</h1>
          <p className="text-muted-foreground flex items-center gap-2">
            Overview of all client accounts
            {lastSynced && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> Last synced: {lastSynced}
              </span>
            )}
          </p>
        </div>
        <CurrencyToggle />
      </div>

      {pendingCount > 0 && (
        <Link to="/admin/pending">
          <Card className="border-warning/50 bg-warning/10 hover:bg-warning/20 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-3 py-4">
              <ClipboardCheck className="h-5 w-5 text-warning" />
              <span className="font-medium">
                {pendingCount} pending approval{pendingCount > 1 ? "s" : ""} — click to review
              </span>
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Top widgets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-bold">{totalClients}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : <p className="text-3xl font-bold">{formatAmount(totalBalance)}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Balance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : (
              <p className="text-3xl font-bold">{formatAmount(totalClients > 0 ? totalBalance / totalClients : 0)}</p>
            )}
          </CardContent>
        </Card>
        <ProfitLossWidget />
      </div>

      {/* Exchange rate control */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Exchange Rate Control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <Label className="whitespace-nowrap text-sm">1 USD =</Label>
            <Slider
              value={[rateValue]}
              onValueChange={([v]) => setRateValue(v)}
              min={50}
              max={200}
              step={0.5}
              className="flex-1"
            />
            <Input
              type="number"
              value={rateValue}
              onChange={(e) => setRateValue(Number(e.target.value))}
              className="w-24"
              step="0.5"
              min="1"
            />
            <span className="text-sm text-muted-foreground">BDT</span>
            <Button size="sm" onClick={saveRate} disabled={rateSaving}>
              {rateSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Low balance alerts */}
      <LowBalanceAlerts />

      {/* Spend trend chart */}
      <SpendTrendChart />

      {/* Client table */}
      <Card>
        <CardHeader>
          <CardTitle>Client Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : clients.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No clients yet. Add your first client to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Business</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.user_id}>
                      <TableCell className="font-medium">{client.full_name}</TableCell>
                      <TableCell className="hidden sm:table-cell">{client.business_name || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{client.email}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={client.balance >= 0 ? "default" : "destructive"} className="font-mono">
                          {formatAmount(client.balance)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
