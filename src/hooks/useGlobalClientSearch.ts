import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toISODate } from "@/components/DateRangeFilter";

export interface GlobalSearchClient {
  user_id: string;
  full_name: string;
  email: string;
  business_name: string | null;
  balance: number;
  pricing_config: any;
  platform_balances: Record<string, number>;
  phone?: string | null;
  mapping_keyword?: string | null;
  is_active?: boolean;
  is_paused?: boolean;
  pending_payments?: number;
}

/**
 * Lightweight client list for the global ⌘K search popup.
 * Calls the same RPC the dashboard uses with a "today" range; React Query
 * cache is shared so opening the popup on any page is essentially free
 * once the dashboard has loaded.
 */
export function useGlobalClientSearch() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const orgId = profile?.org_id ?? null;

  const today = toISODate(new Date());

  return useQuery({
    queryKey: ["global-client-search", orgId, today],
    enabled: !!user && !!orgId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async (): Promise<GlobalSearchClient[]> => {
      const { data, error } = await supabase.rpc("get_admin_dashboard_summary", {
        p_date_from: today,
        p_date_to: today,
        p_org_id: orgId!,
      });
      if (error) throw error;
      const result = data as any;
      return (result?.clients ?? []).map((c: any) => ({
        user_id: c.user_id,
        full_name: c.full_name,
        email: c.email,
        business_name: c.business_name,
        balance: Number(c.balance),
        pricing_config: c.pricing_config,
        platform_balances: c.platform_balances ?? {},
        phone: c.phone ?? null,
        mapping_keyword: c.mapping_keyword ?? null,
        is_active: c.is_active !== false,
        is_paused: !!c.is_paused,
        pending_payments: Number(c.pending_payments) || 0,
      }));
    },
  });
}
