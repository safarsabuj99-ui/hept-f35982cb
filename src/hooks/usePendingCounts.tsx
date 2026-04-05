import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePendingCounts() {
  const { data } = useQuery({
    queryKey: ["pending-counts"],
    queryFn: async () => {
      const [payments, orders, deposits] = await Promise.all([
        supabase.from("payment_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("campaign_requests" as any).select("*", { count: "exact", head: true }).eq("status", "pending") as any,
        supabase.from("transactions").select("*", { count: "exact", head: true }).eq("type", "credit").eq("status", "pending_approval"),
      ]);
      return {
        pendingPayments: (payments.count ?? 0) + (deposits.count ?? 0),
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
