import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DateRange, toISODate } from "@/components/DateRangeFilter";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { debounce } from "@/lib/debounce";

export interface AccountProfitRow {
  ad_account_id: string;
  account_name: string;
  client_id: string | null;
  client_name: string;
  platforms: string;
  active_campaigns: number;
  spend_usd: number;
  revenue_bdt: number;
  cogs_bdt: number;
  profit_bdt: number;
  margin_pct: number;
}

export interface ClientProfitRow {
  client_id: string;
  client_name: string;
  active_accounts: number;
  active_campaigns: number;
  spend_usd: number;
  revenue_bdt: number;
  cogs_bdt: number;
  profit_bdt: number;
  margin_pct: number;
}

export interface ActiveProfitabilityData {
  wac: number;
  totals: {
    active_accounts: number;
    active_clients: number;
    spend_usd: number;
    revenue_bdt: number;
    cogs_bdt: number;
    profit_bdt: number;
  };
  by_account: AccountProfitRow[];
  by_client: ClientProfitRow[];
}

export function useActiveProfitability(dateRange: DateRange | null) {
  const { session, authReady } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const orgId = profile?.org_id;

  const from = dateRange ? toISODate(dateRange.from) : toISODate(new Date());
  const to = dateRange ? toISODate(dateRange.to) : toISODate(new Date());

  const query = useQuery({
    queryKey: ["active-profitability", from, to, orgId],
    queryFn: async (): Promise<ActiveProfitabilityData> => {
      const { data, error } = await (supabase.rpc as any)("get_active_profitability", {
        p_date_from: from,
        p_date_to: to,
        p_org_id: orgId,
      });
      if (error) throw error;
      const r = data as any;
      return {
        wac: Number(r?.wac) || 0,
        totals: {
          active_accounts: Number(r?.totals?.active_accounts) || 0,
          active_clients: Number(r?.totals?.active_clients) || 0,
          spend_usd: Number(r?.totals?.spend_usd) || 0,
          revenue_bdt: Number(r?.totals?.revenue_bdt) || 0,
          cogs_bdt: Number(r?.totals?.cogs_bdt) || 0,
          profit_bdt: Number(r?.totals?.profit_bdt) || 0,
        },
        by_account: (r?.by_account ?? []) as AccountProfitRow[],
        by_client: (r?.by_client ?? []) as ClientProfitRow[],
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
      () => queryClient.invalidateQueries({ queryKey: ["active-profitability"] }),
      1500
    );
    const channel = supabase
      .channel("active-profitability-realtime")
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
