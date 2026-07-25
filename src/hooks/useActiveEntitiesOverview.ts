import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DateRange, toISODate } from "@/components/DateRangeFilter";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { debounce } from "@/lib/debounce";

export interface ActiveClientRow {
  client_id: string;
  client_name: string;
  active_accounts: number;
  active_campaigns: number;
  spend_today: number;
  spend_7d: number;
  spend_30d: number;
  wallet_usd: number;
  runway_days: number | null;
  profit_bdt: number;
  margin_pct: number;
}

export interface ActiveAccountRow {
  ad_account_id: string;
  account_name: string;
  client_id: string | null;
  client_name: string;
  platforms: string;
  active_campaigns: number;
  spend_today: number;
  spend_7d: number;
  spend_30d: number;
  profit_bdt: number;
  margin_pct: number;
}

export interface ActiveEntitiesOverview {
  wac: number;
  totals: {
    active_clients: number;
    active_accounts: number;
    spend_today_usd: number;
    spend_7d_usd: number;
    spend_30d_usd: number;
  };
  by_client: ActiveClientRow[];
  by_account: ActiveAccountRow[];
}

export function useActiveEntitiesOverview(dateRange: DateRange | null) {
  const { session, authReady } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const orgId = profile?.org_id;

  const from = dateRange ? toISODate(dateRange.from) : toISODate(new Date());
  const to = dateRange ? toISODate(dateRange.to) : toISODate(new Date());

  const query = useQuery({
    queryKey: ["active-entities-overview", from, to, orgId],
    queryFn: async (): Promise<ActiveEntitiesOverview> => {
      const { data, error } = await (supabase.rpc as any)(
        "get_active_entities_overview",
        { p_date_from: from, p_date_to: to, p_org_id: orgId },
      );
      if (error) throw error;
      const r = (data ?? {}) as any;
      return {
        wac: Number(r?.wac) || 0,
        totals: {
          active_clients: Number(r?.totals?.active_clients) || 0,
          active_accounts: Number(r?.totals?.active_accounts) || 0,
          spend_today_usd: Number(r?.totals?.spend_today_usd) || 0,
          spend_7d_usd: Number(r?.totals?.spend_7d_usd) || 0,
          spend_30d_usd: Number(r?.totals?.spend_30d_usd) || 0,
        },
        by_client: (r?.by_client ?? []) as ActiveClientRow[],
        by_account: (r?.by_account ?? []) as ActiveAccountRow[],
      };
    },
    enabled: authReady && !!session && !!orgId,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!authReady || !session) return;
    const invalidate = debounce(
      () => queryClient.invalidateQueries({ queryKey: ["active-entities-overview"] }),
      1500,
    );
    const channel = supabase
      .channel("active-entities-overview-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_metrics" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns" }, invalidate)
      .subscribe();
    return () => {
      invalidate.cancel();
      supabase.removeChannel(channel);
    };
  }, [queryClient, authReady, session]);

  return query;
}
