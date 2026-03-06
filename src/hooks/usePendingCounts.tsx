import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePendingCounts() {
  const { data } = useQuery({
    queryKey: ["pending-counts"],
    queryFn: async () => {
      const [payments, orders] = await Promise.all([
        supabase.from("payment_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("campaign_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      return {
        pendingPayments: payments.count ?? 0,
        pendingOrders: orders.count ?? 0,
      };
    },
    refetchInterval: 30000,
  });

  return {
    pendingPayments: data?.pendingPayments ?? 0,
    pendingOrders: data?.pendingOrders ?? 0,
  };
}
