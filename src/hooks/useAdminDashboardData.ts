import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DateRange, toISODate } from "@/components/DateRangeFilter";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { debounce } from "@/lib/debounce";

interface ClientWithBalance {
  user_id: string;
  full_name: string;
  email: string;
  business_name: string | null;
  balance: number;
  pricing_config: any;
  platform_balances: Record<string, number>;
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

async function fetchDashboardData(dateRange: DateRange | null, orgId: string): Promise<DashboardData> {
  const from = dateRange ? toISODate(dateRange.from) : toISODate(new Date());
  const to = dateRange ? toISODate(dateRange.to) : toISODate(new Date());

  const { data, error } = await supabase.rpc("get_admin_dashboard_summary", {
    p_date_from: from,
    p_date_to: to,
    p_org_id: orgId,
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
    platform_balances: c.platform_balances ?? {},
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
  const { session, authReady } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const orgId = profile?.org_id;

  const dateKey = dateRange
    ? `${toISODate(dateRange.from)}_${toISODate(dateRange.to)}`
    : "all";

  const query = useQuery({
    queryKey: ["admin-dashboard", dateKey, orgId],
    queryFn: () => fetchDashboardData(dateRange, orgId!),
    enabled: authReady && !!session && !!orgId,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Realtime invalidation — debounced so a burst of inserts (e.g. sync workers
  // writing 200 daily_metrics rows) only triggers ONE refetch instead of 200.
  useEffect(() => {
    if (!authReady || !session) return;
    const invalidate = debounce(() => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }), 1500);
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_metrics" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_ad_spend" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "usd_purchases" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_requests" }, invalidate)
      .subscribe();
    return () => { invalidate.cancel(); supabase.removeChannel(channel); };
  }, [queryClient, authReady, session]);

  return query;
}
