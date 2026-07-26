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
 *
 * Primary source: `get_admin_dashboard_summary` RPC (cache-shared with the
 * dashboard so opening the popup is essentially free once the dashboard has
 * loaded).
 *
 * Defensive fallback: unions with a direct `profiles + user_roles` fetch so
 * that *every* client in the org appears in search — even if the RPC omits
 * them (no metrics/mapping/balance). Anyone missing from the RPC is added
 * with `balance = 0` and empty platform balances.
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
      const [rpcRes, rolesRes] = await Promise.all([
        supabase.rpc("get_admin_dashboard_summary", {
          p_date_from: today,
          p_date_to: today,
          p_org_id: orgId!,
        }),
        // Every client-role user in this org — guarantees no profile is
        // missing from search even if the RPC left them out.
        supabase
          .from("user_roles")
          .select("user_id, role, profiles!inner(user_id, full_name, email, business_name, phone, mapping_keyword, is_active, org_id)" as any)
          .eq("role", "client" as any)
          .eq("profiles.org_id" as any, orgId!),
      ]);

      if (rpcRes.error) throw rpcRes.error;

      const rpcClients = ((rpcRes.data as any)?.clients ?? []).map((c: any) => ({
        user_id: c.user_id as string,
        full_name: c.full_name as string,
        email: (c.email as string) ?? "",
        business_name: (c.business_name as string) ?? null,
        balance: Number(c.balance) || 0,
        pricing_config: c.pricing_config,
        platform_balances: (c.platform_balances ?? {}) as Record<string, number>,
        phone: (c.phone as string) ?? null,
        mapping_keyword: (c.mapping_keyword as string) ?? null,
        is_active: c.is_active !== false,
        is_paused: !!c.is_paused,
        pending_payments: Number(c.pending_payments) || 0,
      })) as GlobalSearchClient[];

      const byId = new Map<string, GlobalSearchClient>();
      for (const c of rpcClients) byId.set(c.user_id, c);

      // Fallback: fill in any client role missing from the RPC.
      if (!rolesRes.error && Array.isArray(rolesRes.data)) {
        for (const row of rolesRes.data as any[]) {
          const p = row.profiles;
          if (!p?.user_id) continue;
          if (byId.has(p.user_id)) continue;
          byId.set(p.user_id, {
            user_id: p.user_id,
            full_name: p.full_name ?? "Unnamed client",
            email: p.email ?? "",
            business_name: p.business_name ?? null,
            balance: 0,
            pricing_config: null,
            platform_balances: {},
            phone: p.phone ?? null,
            mapping_keyword: p.mapping_keyword ?? null,
            is_active: p.is_active !== false,
            is_paused: false,
            pending_payments: 0,
          });
        }
      }

      return Array.from(byId.values());
    },
  });
}
