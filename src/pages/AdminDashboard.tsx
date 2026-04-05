import { useState, useCallback } from "react";
import { getPlatformRates } from "@/lib/pricing";
import { PullToRefresh } from "@/components/PullToRefresh";
import { DateRangeFilter, DateRange, DatePreset, getLocalToday } from "@/components/DateRangeFilter";
import { useAdminDashboardData } from "@/hooks/useAdminDashboardData";

import { ProfitLossWidget } from "@/components/ProfitLossWidget";
import { SpendTrendChart } from "@/components/SpendTrendChart";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { RevenueVsCostChart } from "@/components/dashboard/RevenueVsCostChart";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";

import { ProfitabilityTable } from "@/components/dashboard/ProfitabilityTable";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { AttentionPanel } from "@/components/dashboard/AttentionPanel";
import { RunwayPrediction } from "@/components/RunwayPrediction";
import { DepositFundsDialog } from "@/components/DepositFundsDialog";
import {
  DollarSign, Banknote, AlertCircle, Wallet
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminDashboard() {
  const [depositOpen, setDepositOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | null>(() => {
    const t = getLocalToday();
    return { from: t, to: t };
  });
  const [datePreset, setDatePreset] = useState<DatePreset>("today");

  const { data, isLoading: loading, refetch } = useAdminDashboardData(dateRange);
  const queryClient = useQueryClient();

  const handleDateChange = useCallback((range: DateRange | null, preset: DatePreset) => {
    setDateRange(range);
    setDatePreset(preset);
  }, []);

  const clients = data?.clients ?? [];
  const todaySpend = data?.todaySpend ?? 0;
  const yesterdaySpend = data?.yesterdaySpend ?? 0;
  const todayCollections = data?.todayCollections ?? 0;
  const pendingCount = data?.pendingCount ?? 0;
  const activeAccounts = data?.activeAccounts ?? 0;
  const lastSynced = data?.lastSynced ?? null;
  const allTransactions = data?.allTransactions ?? [];
  const spendHistory = data?.spendHistory ?? [];
  const collectHistory = data?.collectHistory ?? [];

  const totalBalance = clients.filter(c => c.balance > 0).reduce((s, c) => s + c.balance, 0);
  const totalDue = clients.filter(c => c.balance < 0).reduce((s, c) => s + Math.abs(c.balance), 0);

  const totalDueBdt = (() => {
    let bdtSum = 0;
    for (const client of clients) {
      if (client.balance >= 0) continue;
      const pc = (client as any).pricing_config;
      const flatRates = getPlatformRates(pc);
      const clientTxns = allTransactions.filter((t: any) => t.client_id === client.user_id && t.status === "completed");
      const platforms: Array<"meta" | "tiktok" | "google"> = ["meta", "tiktok", "google"];
      let platformNegBdt = 0;
      let accountedUsd = 0;

      for (const platform of platforms) {
        const pCredits = clientTxns.filter((t: any) => t.type === "credit" && t.platform === platform).reduce((s: number, t: any) => s + Number(t.amount), 0);
        const pDebits = clientTxns.filter((t: any) => t.type === "debit" && t.platform === platform).reduce((s: number, t: any) => s + Number(t.amount), 0);
        const pBalance = pCredits - pDebits;
        if (pBalance < 0) {
          const rate = flatRates[platform] || 120;
          platformNegBdt += Math.abs(pBalance) * rate;
          accountedUsd += Math.abs(pBalance);
        }
      }

      const unaccounted = Math.abs(client.balance) - accountedUsd;
      if (unaccounted > 0) {
        const avgRate = flatRates.meta || flatRates.tiktok || flatRates.google || 120;
        platformNegBdt += unaccounted * avgRate;
      }

      bdtSum += platformNegBdt;
    }
    return Math.round(bdtSum * 100) / 100;
  })();

  const spendLabel = datePreset === "today" ? "Today's Spend" : datePreset === "yesterday" ? "Yesterday's Spend" : "Period Spend";
  const collectLabel = datePreset === "today" ? "Today's Collections" : datePreset === "yesterday" ? "Yesterday's Collections" : "Period Collections";

  const spendDiff = todaySpend - yesterdaySpend;
  const spendTrend = yesterdaySpend > 0
    ? { value: `${Math.abs(Math.round((spendDiff / yesterdaySpend) * 100))}% vs yesterday`, positive: spendDiff <= 0 }
    : null;

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="space-y-6">
      <DashboardHeader
        lastSynced={lastSynced}
        activeAccounts={activeAccounts}
        pendingCount={pendingCount}
      />

      <DateRangeFilter onRangeChange={handleDateChange} />

      <QuickActions pendingCount={pendingCount} onAddFunds={() => setDepositOpen(true)} />

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
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
          subtitle={`$${totalDue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          icon={AlertCircle}
          loading={loading}
          accentColor="hsl(var(--destructive))"
        />
        <KpiCard
          title="Total Balance"
          value={`$${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          subtitle={`${clients.filter(c => c.balance > 0).length} clients`}
          icon={Wallet}
          loading={loading}
          accentColor="hsl(var(--chart-meta))"
        />
      </div>

      <div>
        <p className="section-label">Financial Intelligence</p>
        <div className="grid gap-4 md:grid-cols-2">
          <ProfitabilityTable dateRange={dateRange} />
          <ProfitLossWidget dateRange={dateRange} />
        </div>
      </div>

      <div>
        <p className="section-label">Analytics</p>
        <div className="grid gap-4 md:grid-cols-2">
          <SpendTrendChart dateRange={dateRange} />
          <RevenueVsCostChart dateRange={dateRange} />
        </div>
      </div>

      <RunwayPrediction />

      <div>
        <p className="section-label">Operations</p>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <div className="md:col-span-2">
            <AttentionPanel />
          </div>
          <RecentActivityFeed />
        </div>
      </div>

      <DepositFundsDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        showClientSelector
        isAdmin
        onSuccess={handleRefresh}
      />
    </div>
    </PullToRefresh>
  );
}
