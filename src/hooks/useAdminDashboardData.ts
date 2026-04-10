import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DateRange, toISODate } from "@/components/DateRangeFilter";
import { useAuth } from "@/hooks/useAuth";

interface ClientWithBalance {
  user_id: string;
  full_name: string;
  email: string;
  business_name: string | null;
  balance: number;
  pricing_config: any;
}

interface DashboardData {
  clients: ClientWithBalance[];
  todaySpend: number;
  yesterdaySpend: number;
  todayCollections: number;
  pendingCount: number;
  activeAccounts: number;
  lastSynced: string | null;
  spendHistory: number[];
  collectHistory: number[];
}

async function fetchDashboardData(dateRange: DateRange | null): Promise<DashboardData> {
  const from = dateRange ? toISODate(dateRange.from) : toISODate(new Date());
  const to = dateRange ? toISODate(dateRange.to) : toISODate(new Date());

  const { data, error } = await supabase.rpc("get_admin_dashboard_summary", {
    p_date_from: from,
    p_date_to: to,
  });

  if (error) {
    console.error("Dashboard RPC error:", error);
    throw error;
  }

  const result = data as any;

  const clients: ClientWithBalance[] = (result.clients ?? []).map((c: any) => ({
    user_id: c.user_id,
    full_name: c.full_name,
    email: c.email,
    business_name: c.business_name,
    balance: Number(c.balance),
    pricing_config: c.pricing_config,
  }));

  const lastSynced = result.lastSynced
    ? new Date(result.lastSynced).toLocaleString()
    : null;

  return {
    clients,
    todaySpend: Number(result.todaySpend) || 0,
    yesterdaySpend: Number(result.yesterdaySpend) || 0,
    todayCollections: Number(result.todayCollections) || 0,
    pendingCount: Number(result.pendingCount) || 0,
    activeAccounts: Number(result.activeAccounts) || 0,
    lastSynced,
    spendHistory: (result.spendHistory ?? []).map(Number),
    collectHistory: (result.collectHistory ?? []).map(Number),
  };
}

export function useAdminDashboardData(dateRange: DateRange | null) {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const dateKey = dateRange
    ? `${toISODate(dateRange.from)}_${toISODate(dateRange.to)}`
    : "all";

  const query = useQuery({
    queryKey: ["admin-dashboard", dateKey],
    queryFn: () => fetchDashboardData(dateRange),
    enabled: !!session,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Realtime invalidation
  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_metrics" }, () => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_ad_spend" }, () => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "usd_purchases" }, () => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_requests" }, () => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}
