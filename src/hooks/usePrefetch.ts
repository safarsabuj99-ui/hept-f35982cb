import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const prefetchFns: Record<string, () => Promise<any>> = {
  "/admin/clients": async () => {
    const { data } = await supabase.from("profiles").select("user_id, full_name, email, business_name, is_active");
    return data;
  },
  "/admin/ad-accounts": async () => {
    const { data } = await supabase.from("ad_accounts").select("*");
    return data;
  },
  "/admin/finance": async () => {
    const { data } = await supabase.from("agency_accounts").select("*").eq("is_active", true);
    return data;
  },
  "/admin/payment-requests": async () => {
    const { data } = await supabase.from("payment_requests").select("*").order("created_at", { ascending: false }).limit(50);
    return data;
  },
  "/admin/orders": async () => {
    const { data } = await supabase.from("campaign_requests").select("*").order("created_at", { ascending: false }).limit(50);
    return data;
  },
  "/admin/team": async () => {
    const { data } = await supabase.from("profiles").select("user_id, full_name, email, is_active");
    return data;
  },
};

export function usePrefetch() {
  const queryClient = useQueryClient();

  const prefetch = useCallback(
    (path: string) => {
      const fn = prefetchFns[path];
      if (!fn) return;
      queryClient.prefetchQuery({
        queryKey: ["prefetch", path],
        queryFn: fn,
        staleTime: 60_000,
      });
    },
    [queryClient]
  );

  return prefetch;
}
