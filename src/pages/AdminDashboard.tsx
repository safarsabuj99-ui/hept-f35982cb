import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import { CurrencyToggle } from "@/components/CurrencyToggle";
import { ProfitLossWidget } from "@/components/ProfitLossWidget";
import { LowBalanceAlerts } from "@/components/LowBalanceAlerts";
import { SpendTrendChart } from "@/components/SpendTrendChart";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { RevenueVsCostChart } from "@/components/dashboard/RevenueVsCostChart";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { ClientOverviewTable } from "@/components/dashboard/ClientOverviewTable";
import { UnassignedSpendAlert } from "@/components/dashboard/UnassignedSpendAlert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, Banknote, AlertCircle, Wallet, MonitorSmartphone,
  ClipboardCheck, Clock, Loader2
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface ClientWithBalance {
  user_id: string;
  full_name: string;
  email: string;
  business_name: string | null;
  balance: number;
  todaySpend: number;
}

export default function AdminDashboard() {
  const [clients, setClients] = useState<ClientWithBalance[]>([]);
  const [todaySpend, setTodaySpend] = useState(0);
  const [yesterdaySpend, setYesterdaySpend] = useState(0);
  const [todayCollections, setTodayCollections] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [activeAccounts, setActiveAccounts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [rateValue, setRateValue] = useState(120);
  const [rateSaving, setRateSaving] = useState(false);
  const { exchangeRate } = useCurrency();
  const { toast } = useToast();
  const navigate = useNavigate();

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_ad_spend" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchData = async () => {
    const [profilesRes, rolesRes, txnsRes, pendingRes, syncRes, accountsRes, spendTodayRes, spendYesterdayRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, business_name"),
      supabase.from("user_roles").select("user_id").eq("role", "client"),
      supabase.from("transactions").select("*"),
      (supabase.from("transactions").select("id", { count: "exact" }) as any).eq("status", "pending_approval"),
      supabase.from("api_integrations").select("last_synced_at").order("last_synced_at", { ascending: false }).limit(1),
      supabase.from("ad_accounts").select("id", { count: "exact" }).eq("is_active", true),
      supabase.from("daily_ad_spend").select("final_billable_usd, ad_account_id").eq("date", today),
      supabase.from("daily_ad_spend").select("final_billable_usd").eq("date", yesterday),
    ]);

    const clientUserIds = new Set(rolesRes.data?.map((r) => r.user_id) ?? []);
    const clientProfiles = (profilesRes.data ?? []).filter((p) => clientUserIds.has(p.user_id));
    const transactions = txnsRes.data ?? [];

    // Today's spend per ad_account
    const spendByAccount: Record<string, number> = {};
    for (const row of (spendTodayRes.data ?? []) as any[]) {
      spendByAccount[row.ad_account_id] = (spendByAccount[row.ad_account_id] || 0) + Number(row.final_billable_usd);
    }

    // Get ad_account -> client mapping
    const { data: allAccounts } = await supabase.from("ad_accounts").select("id, client_id");
    const accountToClient: Record<string, string> = {};
    for (const acc of allAccounts ?? []) accountToClient[acc.id] = acc.client_id;

    // Client spend today
    const clientSpendToday: Record<string, number> = {};
    for (const [accId, spend] of Object.entries(spendByAccount)) {
      const cid = accountToClient[accId];
      if (cid) clientSpendToday[cid] = (clientSpendToday[cid] || 0) + spend;
    }

    const result: ClientWithBalance[] = clientProfiles.map((p) => {
      const clientTxns = transactions.filter((t: any) => t.client_id === p.user_id && t.status === "completed");
      const credits = clientTxns.filter((t: any) => t.type === "credit").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const debits = clientTxns.filter((t: any) => t.type === "debit").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      return { ...p, balance: credits - debits, todaySpend: clientSpendToday[p.user_id] || 0 };
    });

    // KPI calculations
    const todaySpendTotal = (spendTodayRes.data ?? []).reduce((s: number, r: any) => s + Number(r.final_billable_usd), 0);
    const yesterdaySpendTotal = (spendYesterdayRes.data ?? []).reduce((s: number, r: any) => s + Number(r.final_billable_usd), 0);

    const todayTxns = transactions.filter((t: any) => t.date === today && t.type === "credit" && t.status === "completed");
    const todayCollect = todayTxns.reduce((s: number, t: any) => s + Number(t.amount), 0);

    setClients(result);
    setTodaySpend(Math.round(todaySpendTotal * 100) / 100);
    setYesterdaySpend(Math.round(yesterdaySpendTotal * 100) / 100);
    setTodayCollections(Math.round(todayCollect * 100) / 100);
    setPendingCount(pendingRes.count ?? 0);
    setActiveAccounts((accountsRes as any).count ?? 0);
    setRateValue(exchangeRate);
    if ((syncRes.data as any)?.[0]?.last_synced_at) {
      setLastSynced(new Date((syncRes.data as any)[0].last_synced_at).toLocaleString());
    }
    setLoading(false);
  };

  const saveRate = async () => {
    if (rateValue <= 0) return;
    setRateSaving(true);
    const { error } = await (supabase.from("settings") as any)
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
  const totalDue = clients.filter(c => c.balance < 0).reduce((s, c) => s + Math.abs(c.balance), 0);

  const spendDiff = todaySpend - yesterdaySpend;
  const spendTrend = yesterdaySpend > 0
    ? { value: `${Math.abs(Math.round((spendDiff / yesterdaySpend) * 100))}% vs yesterday`, positive: spendDiff <= 0 }
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            Real-time overview
            {lastSynced && (
              <span className="inline-flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" /> Synced: {lastSynced}
              </span>
            )}
          </p>
        </div>
        <CurrencyToggle />
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="Today's Spend"
          value={`$${todaySpend.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          loading={loading}
          trend={spendTrend}
          accentColor="hsl(var(--primary))"
        />
        <KpiCard
          title="Today's Collections"
          value={`৳${(todayCollections * exchangeRate).toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
          subtitle={`$${todayCollections.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          icon={Banknote}
          loading={loading}
          accentColor="hsl(var(--success))"
        />
        <KpiCard
          title="Payment Due"
          value={`৳${(totalDue * exchangeRate).toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
          subtitle={`$${totalDue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          icon={AlertCircle}
          loading={loading}
          accentColor="hsl(var(--destructive))"
        />
        <KpiCard
          title="Total Balance"
          value={`$${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          subtitle={`${clients.length} clients`}
          icon={Wallet}
          loading={loading}
          accentColor="hsl(var(--chart-meta))"
        />
        <KpiCard
          title="Active Accounts"
          value={String(activeAccounts)}
          icon={MonitorSmartphone}
          loading={loading}
          accentColor="hsl(var(--chart-google))"
        />
        <KpiCard
          title="Pending Approvals"
          value={String(pendingCount)}
          icon={ClipboardCheck}
          loading={loading}
          onClick={() => navigate("/admin/pending")}
          accentColor="hsl(var(--warning))"
          subtitle={pendingCount > 0 ? "Click to review" : undefined}
        />
      </div>

      {/* Row 2: Profit/Loss + Exchange Rate */}
      <div className="grid gap-4 md:grid-cols-2">
        <ProfitLossWidget />
        <Card className="dark:bg-card/80 dark:backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Exchange Rate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-2">
              <p className="text-3xl font-bold font-mono">{rateValue}</p>
              <p className="text-xs text-muted-foreground">BDT per 1 USD</p>
            </div>
            <div className="flex items-center gap-3">
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
                className="w-20 text-center font-mono"
                step="0.5"
                min="1"
              />
              <Button size="sm" onClick={saveRate} disabled={rateSaving}>
                {rateSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <SpendTrendChart />
        <RevenueVsCostChart />
      </div>

      {/* Row 3.5: Unassigned Spend Alert */}
      <UnassignedSpendAlert />

      {/* Row 4: Alerts + Activity */}
      <div className="grid gap-4 md:grid-cols-2">
        <LowBalanceAlerts />
        <RecentActivityFeed />
      </div>

      {/* Row 5: Client Table */}
      <ClientOverviewTable clients={clients} loading={loading} exchangeRate={exchangeRate} />
    </div>
  );
}
