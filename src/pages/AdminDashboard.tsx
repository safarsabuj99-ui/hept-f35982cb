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
  dueBdt: number;
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
  const [totalDueBdt, setTotalDueBdt] = useState(0);
  const [dateRange, setDateRange] = useState<DateRange | null>({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
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
    let spendQuery = supabase.from("daily_metrics").select("spend, campaign_id");
    if (dateRange) {
      spendQuery = spendQuery
        .gte("data_date", toISODate(dateRange.from))
        .lte("data_date", toISODate(dateRange.to));
    }

    const [profilesRes, rolesRes, txnsRes, pendingRes, syncRes, accountsRes, spendRangeRes, spendYesterdayRes, paymentReqRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, business_name, pricing_config"),
      supabase.from("user_roles").select("user_id").eq("role", "client"),
      supabase.from("transactions").select("*"),
      (supabase.from("transactions").select("id", { count: "exact" }) as any).eq("status", "pending_approval"),
      supabase.from("api_integrations").select("last_synced_at").order("last_synced_at", { ascending: false }).limit(1),
      supabase.from("ad_accounts").select("id", { count: "exact" }).eq("is_active", true),
      spendQuery,
      supabase.from("daily_metrics").select("spend").eq("data_date", yesterday),
      supabase.from("payment_requests").select("amount_bdt, created_at, client_id").eq("status", "approved"),
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

    const approvedPayments = (paymentReqRes.data ?? []) as any[];

    const result: ClientWithBalance[] = clientProfiles.map((p: any) => {
      const clientTxns = transactions.filter((t: any) => t.client_id === p.user_id && t.status === "completed");
      const credits = clientTxns.filter((t: any) => t.type === "credit").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const debits = clientTxns.filter((t: any) => t.type === "debit").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const balance = credits - debits;

      // Calculate per-client BDT due
      let dueBdt = 0;
      if (balance < 0) {
        const flatRates = p.pricing_config?.flat_rates || {};
        const defaultRate = 120;
        const clientDebits = clientTxns.filter((t: any) => t.type === "debit");
        let debitsBdt = 0;
        for (const t of clientDebits) {
          const rate = flatRates[t.platform] || defaultRate;
          debitsBdt += Number(t.amount) * rate;
        }
        const clientPayments = approvedPayments.filter((pr: any) => pr.client_id === p.user_id);
        const creditsBdt = clientPayments.reduce((s: number, pr: any) => s + Number(pr.amount_bdt || 0), 0);
        dueBdt = Math.max(0, debitsBdt - creditsBdt);
      }

      return { ...p, balance, todaySpend: clientSpendInRange[p.user_id] || 0, dueBdt: Math.round(dueBdt * 100) / 100 };
    });

    // Calculate Payment Due in BDT using per-platform rates from pricing_config
    let dueBdtTotal = 0;
    for (const client of result) {
      if (client.balance >= 0) continue; // client doesn't owe anything
      const profile = clientProfiles.find((p: any) => p.user_id === client.user_id) as any;
      const flatRates = profile?.pricing_config?.flat_rates || {};
      const defaultRate = 120;
      
      // Get this client's completed debit transactions grouped by platform
      const clientDebits = transactions.filter((t: any) => t.client_id === client.user_id && t.status === "completed" && t.type === "debit");
      let debitsBdt = 0;
      for (const t of clientDebits) {
        const rate = flatRates[t.platform] || defaultRate;
        debitsBdt += Number(t.amount) * rate;
      }
      
      // Get this client's BDT credits from approved payment_requests
      const clientPayments = approvedPayments.filter((p: any) => p.client_id === client.user_id);
      const creditsBdt = clientPayments.reduce((s: number, p: any) => s + Number(p.amount_bdt || 0), 0);
      
      const clientDueBdt = debitsBdt - creditsBdt;
      if (clientDueBdt > 0) dueBdtTotal += clientDueBdt;
    }
    setTotalDueBdt(Math.round(dueBdtTotal * 100) / 100);

    const rangeSpendTotal = spendRows.reduce((s: number, r: any) => s + Number(r.spend), 0);
    const yesterdaySpendTotal = (spendYesterdayRes.data ?? []).reduce((s: number, r: any) => s + Number(r.spend), 0);

    // Collections from payment_requests (BDT) - already declared above
    const rangeCollPayments = approvedPayments.filter((p: any) => {
      if (dateRange) {
        const pDate = p.created_at.split("T")[0];
        const from = toISODate(dateRange.from);
        const to = toISODate(dateRange.to);
        return pDate >= from && pDate <= to;
      }
      return true; // All Time: include all
    });
    const rangeCollect = rangeCollPayments.reduce((s: number, p: any) => s + Number(p.amount_bdt || 0), 0);

    // Collections sparkline (BDT from payment_requests)
    const dailyCollMap: Record<string, number> = {};
    for (const p of approvedPayments) {
      const pDate = p.created_at.split("T")[0];
      if (pDate >= sevenAgo) {
        dailyCollMap[pDate] = (dailyCollMap[pDate] || 0) + Number(p.amount_bdt || 0);
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
          value={`৳${todayCollections.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          subtitle="BDT"
          icon={Banknote}
          loading={loading}
          accentColor="hsl(var(--success))"
          sparklineData={collectHistory}
        />
        <KpiCard
          title="Payment Due"
          value={`৳${totalDueBdt.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          subtitle="BDT"
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
        isAdmin
        onSuccess={fetchData}
      />
    </div>
    </PullToRefresh>
  );
}
