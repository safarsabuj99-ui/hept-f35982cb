import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PullToRefresh } from "@/components/PullToRefresh";
import { DateRangeFilter, DateRange, DatePreset, toISODate } from "@/components/DateRangeFilter";

import { ProfitLossWidget } from "@/components/ProfitLossWidget";
import { SpendTrendChart } from "@/components/SpendTrendChart";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { RevenueVsCostChart } from "@/components/dashboard/RevenueVsCostChart";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { ClientOverviewTable } from "@/components/dashboard/ClientOverviewTable";
import { ProfitabilityTable } from "@/components/dashboard/ProfitabilityTable";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { AttentionPanel } from "@/components/dashboard/AttentionPanel";
import { RunwayPrediction } from "@/components/RunwayPrediction";
import { DepositFundsDialog } from "@/components/DepositFundsDialog";
import {
  DollarSign, Banknote, AlertCircle, Wallet, Loader2
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { startOfDay, endOfDay, format } from "date-fns";

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
  const [depositOpen, setDepositOpen] = useState(false);
  const [spendHistory, setSpendHistory] = useState<number[]>([]);
  const [collectHistory, setCollectHistory] = useState<number[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  
  const { toast } = useToast();
  const navigate = useNavigate();

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  const handleDateChange = useCallback((range: DateRange | null, preset: DatePreset) => {
    setDateRange(range);
    setDatePreset(preset);
  }, []);

  useEffect(() => { fetchData(); }, [dateRange]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_metrics" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dateRange]);

  const fetchData = useCallback(async () => {
    // Determine date strings for queries
    const rangeFrom = dateRange ? toISODate(dateRange.from) : today;
    const rangeTo = dateRange ? toISODate(dateRange.to) : today;

    let spendQuery = supabase.from("daily_metrics").select("spend, campaign_id")
      .gte("data_date", rangeFrom).lte("data_date", rangeTo);

    const [profilesRes, rolesRes, txnsRes, pendingRes, syncRes, accountsRes, spendRangeRes, spendYesterdayRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, business_name"),
      supabase.from("user_roles").select("user_id").eq("role", "client"),
      supabase.from("transactions").select("*"),
      (supabase.from("transactions").select("id", { count: "exact" }) as any).eq("status", "pending_approval"),
      supabase.from("api_integrations").select("last_synced_at").order("last_synced_at", { ascending: false }).limit(1),
      supabase.from("ad_accounts").select("id", { count: "exact" }).eq("is_active", true),
      spendQuery,
      supabase.from("daily_metrics").select("spend").eq("data_date", yesterday),
    ]);

    // Fetch last 7 days spend for sparkline
    const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const { data: weekSpend } = await supabase.from("daily_metrics").select("data_date, spend").gte("data_date", sevenAgo).order("data_date");
    const dailySpendMap: Record<string, number> = {};
    for (const r of (weekSpend ?? []) as any[]) {
      dailySpendMap[r.data_date] = (dailySpendMap[r.data_date] || 0) + Number(r.spend);
    }
    const spark = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().split("T")[0];
      return dailySpendMap[d] || 0;
    });
    setSpendHistory(spark);

    const clientUserIds = new Set(rolesRes.data?.map((r) => r.user_id) ?? []);
    const clientProfiles = (profilesRes.data ?? []).filter((p) => clientUserIds.has(p.user_id));
    const transactions = txnsRes.data ?? [];

    // Map spend to clients via campaigns -> ad_account_clients
    const spendRows = (spendRangeRes.data ?? []) as any[];
    const campaignIdsInRange = [...new Set(spendRows.map((r: any) => r.campaign_id))];
    
    let campaignToAccount: Record<string, string> = {};
    if (campaignIdsInRange.length > 0) {
      const { data: camps } = await supabase.from("campaigns").select("id, ad_account_id").in("id", campaignIdsInRange);
      for (const c of camps ?? []) campaignToAccount[c.id] = c.ad_account_id;
    }
    
    const { data: allMappings } = await supabase.from("ad_account_clients").select("ad_account_id, client_id");
    const accountToClient: Record<string, string> = {};
    for (const m of allMappings ?? []) accountToClient[m.ad_account_id] = m.client_id;

    const clientSpendInRange: Record<string, number> = {};
    for (const row of spendRows) {
      const accId = campaignToAccount[row.campaign_id];
      const cid = accId ? accountToClient[accId] : null;
      if (cid) clientSpendInRange[cid] = (clientSpendInRange[cid] || 0) + Number(row.spend);
    }

    const result: ClientWithBalance[] = clientProfiles.map((p) => {
      const clientTxns = transactions.filter((t: any) => t.client_id === p.user_id && t.status === "completed");
      const credits = clientTxns.filter((t: any) => t.type === "credit").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const debits = clientTxns.filter((t: any) => t.type === "debit").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      return { ...p, balance: credits - debits, todaySpend: clientSpendInRange[p.user_id] || 0 };
    });

    const rangeSpendTotal = spendRows.reduce((s: number, r: any) => s + Number(r.spend), 0);
    const yesterdaySpendTotal = (spendYesterdayRes.data ?? []).reduce((s: number, r: any) => s + Number(r.spend), 0);

    // Collections for the selected range
    const isNotTransfer = (t: any) => !(t.description && t.description.startsWith("Platform transfer:"));
    const rangeCollTxns = transactions.filter((t: any) => {
      if (t.type !== "credit" || t.status !== "completed" || !isNotTransfer(t)) return false;
      if (dateRange) {
        return t.date >= rangeFrom && t.date <= rangeTo;
      }
      return t.date === today;
    });
    const rangeCollect = rangeCollTxns.reduce((s: number, t: any) => s + Number(t.amount), 0);

    // Collections sparkline
    const dailyCollMap: Record<string, number> = {};
    for (const t of transactions as any[]) {
      if (t.type === "credit" && t.status === "completed" && t.date >= sevenAgo && !(t.description && t.description.startsWith("Platform transfer:"))) {
        dailyCollMap[t.date] = (dailyCollMap[t.date] || 0) + Number(t.amount);
      }
    }
    setCollectHistory(Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().split("T")[0];
      return dailyCollMap[d] || 0;
    }));

    setClients(result);
    setTodaySpend(Math.round(rangeSpendTotal * 100) / 100);
    setYesterdaySpend(Math.round(yesterdaySpendTotal * 100) / 100);
    setTodayCollections(Math.round(rangeCollect * 100) / 100);
    setPendingCount(pendingRes.count ?? 0);
    setActiveAccounts((accountsRes as any).count ?? 0);
    if ((syncRes.data as any)?.[0]?.last_synced_at) {
      setLastSynced(new Date((syncRes.data as any)[0].last_synced_at).toLocaleString());
    }
    setLoading(false);
  }, [today, yesterday, dateRange]);

  const handleSyncNow = useCallback(async () => {
    if (lastSynced) {
      const lastSyncTime = new Date(lastSynced).getTime();
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      if (lastSyncTime > fiveMinAgo) {
        const minutesLeft = Math.ceil((lastSyncTime - fiveMinAgo) / 60000);
        toast({ title: "Data is up to date", description: `Please wait ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""} before syncing again.` });
        return;
      }
    }
    setIsSyncing(true);
    toast({ title: "Syncing...", description: "Fetching latest financial data." });
    try {
      const res = await supabase.functions.invoke("sync-fast-lane", { body: {} });
      if (res.error) throw res.error;
      toast({ title: "Sync complete", description: `${res.data?.synced ?? 0} accounts synced.` });
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  }, [lastSynced, toast]);

  const totalBalance = clients.reduce((s, c) => s + c.balance, 0);
  const totalDue = clients.filter(c => c.balance < 0).reduce((s, c) => s + Math.abs(c.balance), 0);

  const spendLabel = datePreset === "today" ? "Today's Spend" : datePreset === "yesterday" ? "Yesterday's Spend" : "Period Spend";
  const collectLabel = datePreset === "today" ? "Today's Collections" : datePreset === "yesterday" ? "Yesterday's Collections" : "Period Collections";

  const spendDiff = todaySpend - yesterdaySpend;
  const spendTrend = yesterdaySpend > 0
    ? { value: `${Math.abs(Math.round((spendDiff / yesterdaySpend) * 100))}% vs yesterday`, positive: spendDiff <= 0 }
    : null;

  return (
    <PullToRefresh onRefresh={fetchData}>
    <div className="space-y-6">
      <DashboardHeader
        lastSynced={lastSynced}
        activeAccounts={activeAccounts}
        pendingCount={pendingCount}
        onSyncNow={handleSyncNow}
        isSyncing={isSyncing}
      />

      {/* Date Filter */}
      <DateRangeFilter onRangeChange={handleDateChange} />

      {/* Zone 2: Quick Actions Strip */}
      <QuickActions pendingCount={pendingCount} onAddFunds={() => setDepositOpen(true)} />

      {/* Zone 3: Primary KPIs */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 xs:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={spendLabel}
          value={`$${todaySpend.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          loading={loading}
          trend={spendTrend}
          accentColor="hsl(var(--primary))"
          sparklineData={spendHistory}
        />
        <KpiCard
          title={collectLabel}
          value={`$${todayCollections.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          subtitle="USD"
          icon={Banknote}
          loading={loading}
          accentColor="hsl(var(--success))"
          sparklineData={collectHistory}
        />
        <KpiCard
          title="Payment Due"
          value={`$${totalDue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          subtitle="USD"
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
      </div>

      {/* Zone 4: Financial Intelligence */}
      <div>
        <p className="section-label">Financial Intelligence</p>
        <div className="grid gap-4 md:grid-cols-2">
          <ProfitabilityTable dateRange={dateRange} />
          <ProfitLossWidget dateRange={dateRange} />
        </div>
      </div>

      {/* Zone 5: Analytics */}
      <div>
        <p className="section-label">Analytics</p>
        <div className="grid gap-4 md:grid-cols-2">
          <SpendTrendChart dateRange={dateRange} />
          <RevenueVsCostChart dateRange={dateRange} />
        </div>
      </div>

      {/* Zone 5b: Runway Predictions */}
      <RunwayPrediction />

      {/* Zone 6: Attention Required */}
      <div>
        <p className="section-label">Operations</p>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <div className="md:col-span-2">
            <AttentionPanel />
          </div>
          <RecentActivityFeed />
        </div>
      </div>

      {/* Zone 7: Data Tables */}
      <div>
        <p className="section-label">Client Data</p>
        <ClientOverviewTable clients={clients} loading={loading} />
      </div>

      <DepositFundsDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        showClientSelector
        onSuccess={fetchData}
      />
    </div>
    </PullToRefresh>
  );
}
